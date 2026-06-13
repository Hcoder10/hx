"use client";

import { useRef, useState } from "react";

type Status = "idle" | "connecting" | "live" | "ended" | "error";

// Tools the voice agent can call. add_visit writes to the Hx record (real commit).
const TOOLS = [
  {
    type: "function",
    name: "add_visit",
    description:
      "Record a new medical visit/appointment in the patient's Hx record after she describes it. Only call once you have at least a title.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short visit title, e.g. 'ER visit - chest pain'" },
        place: { type: "string", description: "Where it happened" },
        providerName: { type: "string", description: "Doctor or facility name, if known" },
        providerRole: { type: "string", description: "Specialty, if known" },
        date: { type: "string", description: "YYYY-MM-DD, if known" },
        summary: { type: "string", description: "One-sentence plain summary of what happened" },
        medications: {
          type: "array",
          description: "Any new medicines prescribed",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              dose: { type: "string" },
              reason: { type: "string" },
            },
            required: ["name"],
          },
        },
      },
      required: ["title"],
    },
  },
];

export default function CallClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [caption, setCaption] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playHead = useRef(0);
  const callsRef = useRef<Map<string, { name: string; args: string }>>(new Map());

  const RATE = 24000;

  function floatToB64Pcm16(f32: Float32Array): string {
    const buf = new ArrayBuffer(f32.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function playB64Pcm16(b64: string, ac: AudioContext) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const n = Math.floor(bytes.length / 2);
    const f32 = new Float32Array(n);
    for (let i = 0; i < n; i++) f32[i] = view.getInt16(i * 2, true) / 0x8000;
    const buffer = ac.createBuffer(1, n, RATE);
    buffer.getChannelData(0).set(f32);
    const node = ac.createBufferSource();
    node.buffer = buffer;
    node.connect(ac.destination);
    const startAt = Math.max(ac.currentTime, playHead.current);
    node.start(startAt);
    playHead.current = startAt + buffer.duration;
  }

  async function handleToolCall(ws: WebSocket, callId: string, name: string, argsStr: string) {
    let output: unknown = { ok: false, error: "unknown tool" };
    try {
      const args = JSON.parse(argsStr || "{}");
      if (name === "add_visit") {
        const res = await fetch("/api/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        output = await res.json();
        setNote(`✓ Saved to your record: ${args.title ?? "new visit"}`);
      }
    } catch (e) {
      output = { ok: false, error: e instanceof Error ? e.message : "tool failed" };
    }
    // Return the result to the model and let it speak a confirmation.
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
      }),
    );
    ws.send(JSON.stringify({ type: "response.create" }));
  }

  async function start() {
    try {
      setStatus("connecting");
      setError("");
      setCaption("");
      setNote("");

      const res = await fetch("/api/voice/token");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not start the call.");
      const { token, model, instructions } = data;

      const ac = new AudioContext({ sampleRate: RATE });
      acRef.current = ac;
      playHead.current = ac.currentTime;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${model}`, [`xai-client-secret.${token}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              instructions,
              voice: "eve",
              turn_detection: { type: "server_vad" },
              reasoning_effort: "none",
              tools: TOOLS,
              audio: {
                input: { format: { type: "audio/pcm", rate: RATE } },
                output: { format: { type: "audio/pcm", rate: RATE } },
              },
            },
          }),
        );
        ws.send(JSON.stringify({ type: "response.create" })); // greet first

        const source = ac.createMediaStreamSource(stream);
        const proc = ac.createScriptProcessor(4096, 1, 1);
        srcRef.current = source;
        procRef.current = proc;
        proc.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: floatToB64Pcm16(input) }));
        };
        source.connect(proc);
        proc.connect(ac.destination);
        setStatus("live");
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ws.onmessage = (evt) => {
        let ev: any;
        try {
          ev = JSON.parse(typeof evt.data === "string" ? evt.data : "");
        } catch {
          return;
        }
        switch (ev.type) {
          case "error":
            setError(ev.error?.message || "Voice error.");
            break;
          case "response.created":
            setCaption("");
            break;
          case "response.output_audio.delta":
            if (ev.delta) playB64Pcm16(ev.delta, ac);
            break;
          case "response.output_audio_transcript.delta":
            if (typeof ev.delta === "string") setCaption((c) => (c + ev.delta).slice(-500));
            break;
          case "response.output_item.added":
            if (ev.item?.type === "function_call") {
              callsRef.current.set(ev.item.call_id, { name: ev.item.name, args: "" });
            }
            break;
          case "response.function_call_arguments.delta": {
            const c = callsRef.current.get(ev.call_id);
            if (c) c.args += ev.delta || "";
            break;
          }
          case "response.function_call_arguments.done": {
            const stored = callsRef.current.get(ev.call_id);
            const name = ev.name || stored?.name;
            const argsStr = ev.arguments ?? stored?.args ?? "{}";
            if (name) handleToolCall(ws, ev.call_id, name, argsStr);
            callsRef.current.delete(ev.call_id);
            break;
          }
        }
      };

      ws.onerror = () => setError("Connection error.");
      ws.onclose = () => setStatus((s) => (s === "error" ? s : "ended"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call.");
      setStatus("error");
    }
  }

  function stop() {
    try {
      procRef.current?.disconnect();
      srcRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
      acRef.current?.close();
    } catch {}
    setStatus("ended");
  }

  const live = status === "live";
  return (
    <div className="space-y-6">
      <button
        onClick={live || status === "connecting" ? stop : start}
        className={`mx-auto flex h-40 w-40 items-center justify-center rounded-full text-5xl transition ${
          live ? "bg-red-500 text-white" : "bg-teal-600 text-white hover:bg-teal-700"
        }`}
      >
        {live ? "■" : status === "connecting" ? "…" : "🎙️"}
      </button>

      <p className="text-sm font-medium text-gray-700">
        {status === "idle" && "Tap to talk to Hx"}
        {status === "connecting" && "Connecting…"}
        {live && "Listening — say hello, ask “are my medicines safe together?”, or tell Hx about a visit"}
        {status === "ended" && "Call ended. Tap to start again."}
        {status === "error" && "Something went wrong."}
      </p>

      {caption && (
        <div className="mx-auto max-w-md rounded-2xl bg-gray-50 p-4 text-left text-gray-800">{caption}</div>
      )}
      {note && <p className="text-sm font-medium text-teal-700">{note}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-gray-400">
        Powered by Grok Voice (grok-voice-think-fast-1.1). Allow microphone access when asked.
      </p>
    </div>
  );
}
