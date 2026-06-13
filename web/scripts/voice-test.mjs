// Proves the xAI Grok Voice realtime endpoint works with our key + model.
// Reads XAI_API_KEY from .env.local (never prints it). Sends one text turn.
import WebSocket from "ws";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.join(__dirname, "..", ".env.local"), // web/.env.local
  path.join(__dirname, "..", "..", ".env.local"), // repo-root/.env.local
];

function readKey() {
  if (process.env.XAI_API_KEY) return process.env.XAI_API_KEY;
  for (const p of candidates) {
    let txt;
    try { txt = readFileSync(p, "utf8"); } catch { continue; }
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*XAI_API_KEY\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  throw new Error("XAI_API_KEY not found in web/.env.local or repo-root/.env.local");
}

const MODEL = process.env.HX_VOICE_MODEL || "grok-voice-think-fast-1.1";
const key = readKey();
console.log(`Connecting to grok voice realtime (model=${MODEL}) ...`);

const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${MODEL}`, {
  headers: { Authorization: `Bearer ${key}` },
});

const seenTypes = new Set();
let transcript = "";
let audioDeltas = 0;

const done = (code) => {
  console.log("\n--- event types seen ---");
  console.log([...seenTypes].sort().join("\n"));
  console.log(`\naudio deltas: ${audioDeltas}`);
  console.log(`assistant transcript: ${transcript.trim() || "(none captured)"}`);
  try { ws.close(); } catch {}
  process.exit(code);
};

const timer = setTimeout(() => { console.log("\n[timeout]"); done(0); }, 25000);

ws.on("open", () => {
  console.log("WS OPEN ✓");
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      instructions: "You are Hx, a calm health assistant. Reply in one short sentence.",
      turn_detection: null,
      reasoning_effort: "none",
    },
  }));
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: "In one sentence, what is Hx?" }] },
  }));
  ws.send(JSON.stringify({ type: "response.create" }));
});

ws.on("message", (data) => {
  let ev;
  try { ev = JSON.parse(data.toString()); } catch { return; }
  seenTypes.add(ev.type);
  if (ev.type === "error") console.log("ERROR EVENT:", JSON.stringify(ev.error || ev));
  if (/audio\.delta/.test(ev.type)) audioDeltas++;
  if (/transcript\.delta|output_text\.delta|text\.delta/.test(ev.type) && typeof ev.delta === "string") transcript += ev.delta;
  if (ev.type === "response.done" || ev.type === "response.completed") { clearTimeout(timer); done(0); }
});

ws.on("error", (e) => { console.log("WS ERROR:", e.message); clearTimeout(timer); done(1); });
ws.on("close", (c) => console.log(`WS closed (${c})`));
