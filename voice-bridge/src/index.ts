import "dotenv-flow/config";
import express from "express";
import ExpressWs from "express-ws";
import * as crypto from "crypto";
import bot from "./bot";
import { TwilioMediaStreamWebsocket } from "./twilio";

const { app } = ExpressWs(express());
app.use(express.urlencoded({ extended: true })).use(express.json());

// ========================================
// Configuration
// ========================================
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const API_URL = process.env.API_URL || "wss://api.x.ai/v1/realtime";
const MODEL = process.env.HX_VOICE_MODEL || "grok-voice-think-fast-1.1";
const APP_URL = process.env.HX_APP_URL || "http://localhost:3000";
// Public hostname for Twilio <Stream> URLs. MUST use a dedicated var: the OS already
// sets HOSTNAME (= the machine name, e.g. "SquaredCube") and dotenv won't override
// an existing env var, so reusing HOSTNAME silently breaks the stream URL.
const PUBLIC_HOST = process.env.HX_PUBLIC_HOST || "";
// Feature flags
const ENABLE_TOOLS = process.env.ENABLE_TOOLS !== "false"; // Default: enabled

// Clean event logging - just event names, no emojis
function logEvent(callId: string, eventType: string, extra?: string) {
  if (extra) {
    console.log(`[${callId}] ${eventType}`);
    console.log(`  ${extra}`);
  } else {
    console.log(`[${callId}] ${eventType}`);
  }
}

// Helper to generate cryptographically secure IDs
function generateSecureId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

// ========================================
// PHONE AUTH: caller must speak a simple Hx ID before the record unlocks.
// (No caller-ID factor — works from one phone.)  123 = Maria, 456 = Dr. Okafor.
// ========================================
const ID_MAP: Record<string, { userId: string; role: "patient" | "provider"; repoId: string }> = {
  "123": { userId: "maria", role: "patient", repoId: "mental-health" },
  "456": { userId: "okafor", role: "provider", repoId: "mental-health" },
};

const LOCKED_INSTRUCTIONS = `You are the Hx phone line for an AI-augmented psychiatry practice. The caller is NOT yet verified.
Greet them in one short sentence and ask them to say their Hx ID number to access their record.
Do NOT reveal, discuss, or record ANY health information until they are verified.
When they say their digits, call the verify_id tool with those digits. If it fails, ask once more; after 3 failures, apologize and ask them to try later.`;

const AUTH_TOOLS = [
  {
    type: "function",
    name: "verify_id",
    description: "Verify the caller's spoken Hx ID number to unlock their record. Call this with the digits the caller says.",
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "the spoken ID digits, e.g. '123'" } },
      required: ["id"],
    },
  },
];

// Per-call auth state.
type CallAuth = { authed: boolean; cookie: string; role: "patient" | "provider"; repoId: string };

// Server-side dev-login to the Hub -> returns a session cookie for that user.
async function devLogin(userId: string): Promise<string | null> {
  try {
    const r = await fetch(`${APP_URL}/api/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!r.ok) return null;
    const sc = r.headers.get("set-cookie");
    return sc ? sc.split(";")[0] : null; // "hx_session=..."
  } catch {
    return null;
  }
}

// Role grounding (instructions + tools + voice) from the Hub, using the cookie.
async function fetchAgent(role: string, repoId: string, cookie: string) {
  const r = await fetch(`${APP_URL}/api/voice/agent-token?role=${role}&repoId=${repoId}&short=1`, {
    headers: { cookie },
  });
  return r.json() as Promise<{ instructions: string; tools: any[]; voice: string }>;
}

// Execute a role tool (after auth) against the Hub with the call's cookie.
async function runRoleTool(call: CallAuth, name: string, args: Record<string, any>): Promise<string> {
  const h = { "Content-Type": "application/json", cookie: call.cookie };
  const rid = call.repoId;
  const post = (path: string, body: any) =>
    fetch(`${APP_URL}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) }).then((r) => r.text());
  try {
    if (name === "check_meds") return await fetch(`${APP_URL}/api/hub/alerts`, { headers: h }).then((r) => r.text());
    if (name === "get_summary") return await fetch(`${APP_URL}/api/repos/${rid}/visits`, { headers: h }).then((r) => r.text());
    if (name === "record_assessment")
      return await post(`/api/repos/${rid}/visits`, { title: `${args.instrument} check-in`, summary: `${args.instrument} score ${args.score}`, notes: [`${args.instrument}: ${args.score}`] });
    if (name === "log_checkin")
      return await post(`/api/repos/${rid}/visits`, { title: "Phone check-in", summary: args.summary || "", notes: [...((args.symptoms as string[]) || []), ...(((args.negatives as string[]) || []).map((n) => `reports NOT: ${n}`))] });
    if (name === "prescribe")
      return await post(`/api/hub/check-interaction`, { repoId: rid, name: args.name, dose: args.dose, reason: args.reason });
    if (name === "commit_visit")
      return await post(`/api/repos/${rid}/visits`, { title: args.title, summary: args.summary, addProblems: ((args.diagnoses as string[]) || []).map((n) => ({ name: n })), addMedications: ((args.medications as any[]) || []).map((m) => ({ name: m.name, dose: m.dose || "", reason: m.reason || "" })), notes: args.notes || [] });
  } catch (e: any) {
    return JSON.stringify({ ok: false, error: e?.message || "tool failed" });
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ========================================
// Health Check Endpoint
// ========================================
app.get("/health", (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
  res.json(health);
});

// ========================================
// Twilio Voice Webhook Endpoints
// ========================================
app.post("/twiml", async (req, res) => {
  try {
    const callId = generateSecureId('call');

    if (!PUBLIC_HOST) {
      res.status(500).send("Server misconfigured: HX_PUBLIC_HOST not set");
      return;
    }

    res.status(200);
    res.type("text/xml");

    const hostname = PUBLIC_HOST.replace(/^https?:\/\//, '');
    const streamUrl = `wss://${hostname}/media-stream/${callId}`;

    const twimlResponse = `\
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>
`;
    console.log(`[${callId}] /twiml hit by Twilio -> ${streamUrl}`);
    res.end(twimlResponse);
  } catch (error) {
    res.status(500).send();
  }
});

app.post("/call-status", async (req, res) => {
  res.status(200).send();
});

// ========================================
// Twilio Media Stream Websocket Endpoint
// ========================================
app.ws("/media-stream/:callId", async (ws, req) => {
  const callId = req.params.callId;
  
  console.log(`\n[${callId}] === CALL STARTED ===`);

  const tw = new TwilioMediaStreamWebsocket(ws);

  // Set up Twilio start event handler IMMEDIATELY (before async operations)
  tw.on("start", (msg) => {
    tw.streamSid = msg.start.streamSid;
    logEvent(callId, 'twilio.start');
  });

  // Phone calls start LOCKED — the caller must verify an Hx ID before any record
  // access. Persona + role tools are loaded after verify_id succeeds.
  let instructions = LOCKED_INSTRUCTIONS;
  const call: CallAuth = { authed: false, cookie: "", role: "patient", repoId: "mental-health" };
  let authFails = 0;

  // Create raw WebSocket connection to x.ai (pin the early-access voice model)
  const WebSocket = require('ws');
  const xaiWs = new WebSocket(`${API_URL}?model=${MODEL}`, {
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  // Wait for x.ai WebSocket to be ready
  await new Promise((resolve, reject) => {
    const wsTimeout = setTimeout(() => {
      xaiWs.close();
      reject(new Error("x.ai WebSocket connection timeout"));
    }, 10000);

    xaiWs.on('open', () => {
      clearTimeout(wsTimeout);
      logEvent(callId, 'websocket.open');
      resolve(null);
    });

    xaiWs.on('error', (error: any) => {
      clearTimeout(wsTimeout);
      reject(error);
    });
  });

  // Flag to track when session is configured - DO NOT send audio until this is true
  let sessionReady = false;
  let turnCount = 0;
  let turnActive = false; // Track if a turn is in progress

  // Handle messages from x.ai WebSocket
  xaiWs.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      // Log events to console (skip raw audio chunks)
      if (message.type !== 'response.output_audio.delta' && message.type !== 'input_audio_buffer.append') {
        logEvent(callId, message.type);
      }

      if (message.type === 'response.output_audio.delta' && message.delta) {
        // Bot is speaking - sending audio to Twilio (PCMU format)
        const twilioMessage = {
          event: "media" as const,
          media: { payload: message.delta },
          streamSid: tw.streamSid!,
        };
        tw.send(twilioMessage);
      } else if (message.type === 'response.created') {
        // Check if previous turn was interrupted (new response started before previous ended)
        if (turnActive) {
          console.log(`[${callId}] === TURN ${turnCount} INTERRUPTED ===\n`);
        }
        // Mark turn start
        turnCount++;
        turnActive = true;
        console.log(`\n[${callId}] === START TURN ${turnCount} ===`);
      } else if (message.type === 'response.done') {
        // Mark turn end
        turnActive = false;
        console.log(`[${callId}] === END TURN ${turnCount} ===\n`);
      } else if (message.type === 'response.cancelled') {
        // Turn was explicitly cancelled
        turnActive = false;
        console.log(`[${callId}] === TURN ${turnCount} CANCELLED ===\n`);
      } else if (message.type === 'response.output_audio_transcript.delta') {
        // Log bot's speech transcript
        console.log(`[${callId}] Bot: "${message.delta}"`);
      } else if (message.type === 'session.updated') {
        // Session is now configured with correct audio format - safe to send audio
        sessionReady = true;

        // Now that session is configured, send initial greeting
        const conversationItem = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Say hello and introduce yourself'
              }
            ]
          }
        };
        logEvent(callId, conversationItem.type);
        xaiWs.send(JSON.stringify(conversationItem));

        const responseCreate = { type: 'response.create' };
        logEvent(callId, responseCreate.type);
        xaiWs.send(JSON.stringify(responseCreate));
      } else if (message.type === 'conversation.created') {
        console.log(`  conversation_id: ${message.conversation?.id || 'unknown'}`);

        // Send session configuration
        const sessionConfig = {
          type: 'session.update',
          session: {
            instructions,
            voice: 'eve',
            reasoning_effort: 'none',
            audio: {
              input: { format: { type: 'audio/pcmu' } },
              output: { format: { type: 'audio/pcmu' } },
            },
            turn_detection: { type: 'server_vad' },
            tools: AUTH_TOOLS, // locked: only verify_id until the caller proves their ID
          }
        };
        logEvent(callId, sessionConfig.type);
        xaiWs.send(JSON.stringify(sessionConfig));

      } else if (message.type === 'input_audio_buffer.speech_started') {
        // Clear Twilio's audio buffer (interrupt bot if speaking)
        const clearEvent = { event: "clear" as const, streamSid: tw.streamSid! };
        tw.send(clearEvent);

      } else if (message.type === 'error') {
        console.log(`  ERROR: ${message.error?.message || JSON.stringify(message)}`);
      } else if (message.type === 'conversation.item.added') {
        // Silently handle - conversation item added (same as created)
      } else if (message.type === 'response.output_item.added') {
        // Silently handle - output item added to response
      } else if (message.type === 'response.output_item.done') {
        // Check if this is a function call
        if (message.item?.type === 'function_call') {
          // Handle function call asynchronously
          (async () => {
            const functionName = message.item.name;
            const callId_fn = message.item.call_id;
            let args: Record<string, any> = {};
            
            try {
              args = JSON.parse(message.item.arguments || '{}');
            } catch (e) {
              // Failed to parse function arguments
            }
            
            console.log(`[${callId}] FUNCTION CALL: ${functionName}(${JSON.stringify(args)})`);

            // Route: verify_id (auth gate) -> role tools (after auth) -> reject.
            let result: string;
            if (functionName === "verify_id") {
              const id = String(args.id || "").replace(/\D/g, "");
              const m = ID_MAP[id];
              if (!m) {
                authFails++;
                result = JSON.stringify({ verified: false, message: authFails >= 3 ? "Too many failed attempts." : "ID not recognized. Please say your Hx ID again." });
              } else {
                const cookie = await devLogin(m.userId);
                if (!cookie) {
                  result = JSON.stringify({ verified: false, error: "login failed" });
                } else {
                  call.authed = true; call.cookie = cookie; call.role = m.role; call.repoId = m.repoId;
                  try {
                    const agent = await fetchAgent(m.role, m.repoId, cookie);
                    xaiWs.send(JSON.stringify({
                      type: "session.update",
                      session: {
                        instructions: agent.instructions,
                        voice: agent.voice || (m.role === "provider" ? "rex" : "eve"),
                        reasoning_effort: "none",
                        audio: { input: { format: { type: "audio/pcmu" } }, output: { format: { type: "audio/pcmu" } } },
                        turn_detection: { type: "server_vad" },
                        tools: agent.tools,
                      },
                    }));
                  } catch (e) {
                    console.log(`[${callId}] fetchAgent failed: ${e}`);
                  }
                  result = JSON.stringify({ verified: true, role: m.role, message: `Verified. You're speaking as the ${m.role}. How can I help?` });
                }
              }
            } else if (!call.authed) {
              result = JSON.stringify({ ok: false, error: "Caller not verified yet — ask for the Hx ID first." });
            } else {
              result = await runRoleTool(call, functionName, args);
            }
            console.log(`[${callId}] FUNCTION RESULT: ${result.slice(0, 200)}`);
            
            // Send the function result back to XAI
            const functionResult = {
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: callId_fn,
                output: result,
              }
            };
            logEvent(callId, functionResult.type);
            xaiWs.send(JSON.stringify(functionResult));
            
            // Trigger a new response to continue the conversation
            const responseCreate = { type: 'response.create' };
            logEvent(callId, responseCreate.type);
            xaiWs.send(JSON.stringify(responseCreate));
          })();
        }
      } else if (message.type === 'conversation.item.input_audio_transcription.completed') {
        // Log user speech transcription
        if (message.transcript) {
          console.log(`[${callId}] User: "${message.transcript}"`);
        }
      }
      // All other events are just logged by their type (already done above)
    } catch (error) {
      console.error(`[${callId}] Error processing message from x.ai:`, error);
    }
  });

  // Send human speech to x.ai
  tw.on("media", (msg) => {
    try {
      if (msg.media.track === 'inbound') {
        const mulawBase64 = msg.media.payload;

        // DO NOT send audio until session is configured with correct format
        if (!sessionReady) {
          return;
        }

        // Send μ-law audio directly to XAI
        const audioMessage = {
          type: "input_audio_buffer.append",
          audio: mulawBase64
        };

        // Check WebSocket state before sending
        if (xaiWs.readyState !== 1) {
          return;
        }

        xaiWs.send(JSON.stringify(audioMessage));
      }
    } catch (error) {
      console.error(`[${callId}] Error processing audio from Twilio:`, error);
    }
  });

  // Handle x.ai WebSocket errors
  xaiWs.on('error', (error: any) => {
    logEvent(callId, 'websocket.error', error?.message || String(error));
  });

  xaiWs.on('close', (code: number, reason: Buffer) => {
    logEvent(callId, 'websocket.close', `code=${code}`);
  });

  // Handle Twilio WebSocket close
  ws.on("close", () => {
    logEvent(callId, 'twilio.close');
    xaiWs.close();
  });
});

/****************************************************
 Outbound Call Endpoints
****************************************************/

// Outbound agent instructions - this agent makes calls to end users
const OUTBOUND_AGENT_INSTRUCTIONS = `You are an outbound voice agent powered by the Grok Voice Agent API from xAI. You are calling a user to tell them about this exciting new technology.

IMPORTANT: You are making an OUTBOUND call, so YOU must speak first to initiate the conversation.

Start by greeting the user warmly and introducing yourself. Then explain:
- You're calling to share information about the Grok Voice Agent API
- This is a real-time voice AI API that enables natural conversations
- It supports telephony integration with Twilio, WebRTC for browsers, and WebSocket connections
- The API features ultra-low latency, natural turn-taking, and high-quality voice synthesis
- Developers can build voice assistants, customer service agents, and interactive voice applications

Be enthusiastic but not pushy. Answer any questions they have about the technology. Keep responses concise since this is a phone call.

If they're not interested, politely thank them for their time and end the call gracefully.`;

// TwiML endpoint for outbound calls
app.post("/outbound-twiml", (req, res) => {
  const hostname = PUBLIC_HOST.replace(/^https?:\/\//, "");
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${hostname}/outbound-stream" />
  </Connect>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

// WebSocket endpoint for outbound call audio
app.ws("/outbound-stream", (ws: any, req: any) => {
  const WebSocket = require('ws');
  const MAX_TURNS = 3;
  let callSid = "";
  let streamSid = "";
  let xaiWs: any = null;
  let sessionReady = false;
  let turnCount = 0;
  let turnActive = false;

  console.log(`\n[OUTBOUND] === OUTBOUND CALL STARTED ===`);

  // Handle Twilio WebSocket messages
  ws.on("message", async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.event === "start") {
        callSid = msg.start.callSid;
        streamSid = msg.start.streamSid;
        console.log(`[OUTBOUND] [${callSid}] twilio.start`);

        // Connect to XAI
        xaiWs = new WebSocket(API_URL, {
          headers: {
            Authorization: `Bearer ${XAI_API_KEY}`,
          },
        });

        xaiWs.on("open", () => {
          console.log(`[OUTBOUND] [${callSid}] websocket.open`);

          // Send session configuration
          const sessionConfig = {
            type: "session.update",
            session: {
              instructions: OUTBOUND_AGENT_INSTRUCTIONS,
              voice: "rex",
              audio: {
                input: { format: { type: "audio/pcmu" } },
                output: { format: { type: "audio/pcmu" } },
              },
              turn_detection: { type: "server_vad" },
            },
          };
          console.log(`[OUTBOUND] [${callSid}] session.update`);
          xaiWs.send(JSON.stringify(sessionConfig));
        });

        xaiWs.on("message", (xaiData: Buffer) => {
          try {
            const message = JSON.parse(xaiData.toString());

            // Log event type (skip audio chunks)
            if (message.type !== "response.output_audio.delta") {
              console.log(`[OUTBOUND] [${callSid}] ${message.type}`);
            }

            if (message.type === "session.updated") {
              sessionReady = true;
              
              // Trigger the agent to speak first (outbound call)
              const responseCreate = { type: "response.create" };
              xaiWs.send(JSON.stringify(responseCreate));
              console.log(`[OUTBOUND] [${callSid}] Agent speaking first...`);
            } else if (message.type === "response.created") {
              if (turnActive) {
                console.log(`[OUTBOUND] [${callSid}] === TURN ${turnCount} INTERRUPTED ===\n`);
              }
              turnCount++;
              turnActive = true;
              console.log(`\n[OUTBOUND] [${callSid}] === START TURN ${turnCount} ===`);
            } else if (message.type === "response.output_audio.delta" && message.delta) {
              // Send bot audio to Twilio
              const twilioMessage = {
                event: "media",
                streamSid,
                media: { payload: message.delta },
              };
              ws.send(JSON.stringify(twilioMessage));
            } else if (message.type === "response.output_audio_transcript.delta") {
              if (message.delta) {
                console.log(`[OUTBOUND] [${callSid}] Caller: "${message.delta}"`);
              }
            } else if (message.type === "conversation.item.input_audio_transcription.completed") {
              if (message.transcript) {
                console.log(`[OUTBOUND] [${callSid}] Remote: "${message.transcript}"`);
              }
            } else if (message.type === "response.done") {
              turnActive = false;
              console.log(`[OUTBOUND] [${callSid}] === END TURN ${turnCount} ===\n`);
              
              // End call after MAX_TURNS
              if (turnCount >= MAX_TURNS) {
                console.log(`[OUTBOUND] [${callSid}] Max turns reached, ending in 10s...`);
                setTimeout(() => {
                  console.log(`[OUTBOUND] [${callSid}] Ending call now`);
                  if (xaiWs) xaiWs.close();
                  ws.close();
                }, 10000);
              }
            } else if (message.type === "error") {
              console.log(`[OUTBOUND] [${callSid}] ERROR: ${message.error?.message || JSON.stringify(message)}`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        });

        xaiWs.on("close", () => {
          console.log(`[OUTBOUND] [${callSid}] websocket.close`);
        });

      } else if (msg.event === "media" && msg.media?.track === "inbound") {
        // Forward audio from the remote party to XAI
        if (xaiWs && sessionReady && xaiWs.readyState === WebSocket.OPEN) {
          const audioMessage = {
            type: "input_audio_buffer.append",
            audio: msg.media.payload,
          };
          xaiWs.send(JSON.stringify(audioMessage));
        }
      } else if (msg.event === "stop") {
        console.log(`[OUTBOUND] [${callSid}] twilio.stop`);
        if (xaiWs) xaiWs.close();
      }
    } catch (e) {
      // Ignore errors
    }
  });

  ws.on("close", () => {
    console.log(`[OUTBOUND] twilio.close`);
    if (xaiWs) xaiWs.close();
  });
});

/****************************************************
 Start Server
****************************************************/
const port = process.env.PORT || "3000";
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Tool calling: ${ENABLE_TOOLS ? "ENABLED" : "DISABLED"}`);
});
