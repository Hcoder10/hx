"use client";

import { useRef, useState } from "react";

type Status = "idle" | "connecting" | "live" | "ended" | "error";
type Props = { role: "patient" | "provider"; repoId?: string; label?: string };

// Role-aware Grok realtime voice agent for the Hub. Patient agent runs
// measurement-based check-ins (PHQ-9/GAD-7); provider agent dictates assessment /
// prescribing / commits. Tools resolve against the Hub APIs (same-origin cookies
// carry the session). Shows captions + an on-screen action log for the demo.
export default function VoiceAgent({ role, repoId, label }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [caption, setCaption] = useState("");
  const [log, setLog] = useState<{ kind: "ok" | "warn"; text: string }[]>([]);
  const [error, setError] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playHead = useRef(0);
  const callsRef = useRef<Map<string, { name: string; args: string }>>(new Map());
  const repoRef = useRef<string>(repoId || "");
  const RATE = 24000;

  const addLog = (kind: "ok" | "warn", text: string) => setLog((l) => [...l.slice(-6), { kind, text }]);

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

  // POST/GET helpers (same-origin: session cookie is sent automatically).
  async function api(path: string, init?: RequestInit) {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    return res.json().catch(() => ({}));
  }

  async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const rid = repoRef.current;
    if (name === "record_assessment") {
      const instrument = String(args.instrument || "PHQ-9");
      const score = Number(args.score ?? 0);
      const out = await api(`/api/repos/${rid}/visits`, {
        method: "POST",
        body: JSON.stringify({
          title: `${instrument} check-in`,
          summary: `${instrument} score ${score}`,
          notes: [`${instrument}: ${score}`, args.note ? String(args.note) : ""].filter(Boolean),
        }),
      });
      addLog("ok", `📋 ${instrument} recorded: ${score}`);
      return out;
    }
    if (name === "log_checkin") {
      const symptoms = (args.symptoms as string[]) || [];
      const sideEffects = (args.side_effects as string[]) || [];
      const negatives = (args.negatives as string[]) || [];
      const out = await api(`/api/repos/${rid}/visits`, {
        method: "POST",
        body: JSON.stringify({
          title: "Patient check-in",
          summary: String(args.summary || "Check-in"),
          notes: [
            ...symptoms,
            ...sideEffects.map((s) => `side effect: ${s}`),
            ...negatives.map((n) => `reports NOT: ${n}`),
          ],
        }),
      });
      addLog("ok", `📝 Check-in saved: ${args.summary || ""}`);
      return out;
    }
    if (name === "check_meds") {
      const out = await api(`/api/hub/alerts`);
      const alerts = (out.alerts as { title: string }[]) || [];
      if (alerts.length) addLog("warn", `⚠️ ${alerts.length} interaction alert(s)`);
      return out;
    }
    if (name === "get_summary") {
      const out = await api(`/api/repos/${rid}/visits`);
      return out;
    }
    if (name === "prescribe") {
      const out = await api(`/api/hub/check-interaction`, {
        method: "POST",
        body: JSON.stringify({ repoId: rid, name: args.name, dose: args.dose, reason: args.reason }),
      });
      const warnings = (out.warnings as { summary: string }[]) || [];
      if (warnings.length) addLog("warn", `⚠️ ${args.name}: ${warnings[0]?.summary || "interaction risk"}`);
      else addLog("ok", `✓ ${args.name} — no interaction found`);
      return out;
    }
    if (name === "commit_visit") {
      const diagnoses = (args.diagnoses as string[]) || [];
      const meds = (args.medications as { name: string; dose?: string; reason?: string }[]) || [];
      const notes = (args.notes as string[]) || [];
      const visitBody = {
        title: String(args.title || "Visit"),
        summary: String(args.summary || ""),
        addProblems: diagnoses.map((name) => ({ name })),
        addMedications: meds.map((m) => ({ name: m.name, dose: m.dose || "", reason: m.reason || "" })),
        notes,
      };
      const out = await api(`/api/repos/${rid}/visits`, { method: "POST", body: JSON.stringify(visitBody) });
      addLog("ok", `✅ Visit committed: ${visitBody.title}`);
      // Show the RAG+Grok coding in context (does not block the commit).
      try {
        const coded = await api(`/api/validate`, {
          method: "POST",
          body: JSON.stringify({ encounter: { id: "voice", date: "2026-06-13", providerId: "er", place: "", ...visitBody } }),
        });
        const ok = (coded.entries as { accepted: boolean; term: string; system: string; code: string }[] | undefined)?.filter((e) => e.accepted) || [];
        if (ok.length) addLog("ok", `🏷️ Coded: ${ok.map((e) => `${e.code}`).join(", ")}`);
        return { ...out, coding: coded };
      } catch {
        return out;
      }
    }
    return { ok: false, error: "unknown tool" };
  }

  async function handleToolCall(ws: WebSocket, callId: string, name: string, argsStr: string) {
    let output: unknown = { ok: false, error: "tool failed" };
    try {
      output = await runTool(name, JSON.parse(argsStr || "{}"));
    } catch (e) {
      output = { ok: false, error: e instanceof Error ? e.message : "tool failed" };
    }
    ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) } }));
    ws.send(JSON.stringify({ type: "response.create" }));
  }

  async function start() {
    try {
      setStatus("connecting");
      setError("");
      setCaption("");
      setLog([]);
      const qs = new URLSearchParams({ role });
      if (repoId) qs.set("repoId", repoId);
      const data = await api(`/api/voice/agent-token?${qs.toString()}`);
      if (!data?.token) throw new Error(data?.error || "Could not start the agent.");
      repoRef.current = data.repoId || repoId || "";
      const { token, model, instructions, tools, voice } = data;

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
              voice: voice || "eve",
              turn_detection: { type: "server_vad" },
              reasoning_effort: "none",
              tools,
              audio: {
                input: { format: { type: "audio/pcm", rate: RATE } },
                output: { format: { type: "audio/pcm", rate: RATE } },
              },
            },
          }),
        );
        ws.send(JSON.stringify({ type: "response.create" }));
        const source = ac.createMediaStreamSource(stream);
        const proc = ac.createScriptProcessor(4096, 1, 1);
        srcRef.current = source;
        procRef.current = proc;
        proc.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: floatToB64Pcm16(e.inputBuffer.getChannelData(0)) }));
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
          case "response.output_audio.delta":
            if (ev.delta) playB64Pcm16(ev.delta, ac);
            break;
          case "response.output_audio_transcript.delta":
            if (typeof ev.delta === "string") setCaption((c) => (c + ev.delta).slice(-500));
            break;
          case "response.created":
            setCaption("");
            break;
          case "response.output_item.added":
            if (ev.item?.type === "function_call") callsRef.current.set(ev.item.call_id, { name: ev.item.name, args: "" });
            break;
          case "response.function_call_arguments.delta": {
            const c = callsRef.current.get(ev.call_id);
            if (c) c.args += ev.delta || "";
            break;
          }
          case "response.function_call_arguments.done": {
            const stored = callsRef.current.get(ev.call_id);
            const nm = ev.name || stored?.name;
            const argsStr = ev.arguments ?? stored?.args ?? "{}";
            if (nm) handleToolCall(ws, ev.call_id, nm, argsStr);
            callsRef.current.delete(ev.call_id);
            break;
          }
        }
      };
      ws.onerror = () => setError("Connection error.");
      ws.onclose = () => setStatus((s) => (s === "error" ? s : "ended"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the agent.");
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
  const tint = role === "provider" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-teal-600 hover:bg-teal-700";
  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={live || status === "connecting" ? stop : start}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white transition ${live ? "bg-red-500" : tint}`}
        >
          {live ? "■" : status === "connecting" ? "…" : "🎙️"}
        </button>
        <div className="text-sm">
          <div className="font-semibold text-gray-900">{label || (role === "provider" ? "Provider voice agent" : "Talk to Hx")}</div>
          <div className="text-gray-500">
            {status === "idle" && (role === "provider" ? "Dictate the visit, prescribe, commit" : "Check in, run your assessment, ask about your meds")}
            {status === "connecting" && "Connecting…"}
            {live && "Listening…"}
            {status === "ended" && "Ended — tap to talk again"}
            {status === "error" && "Something went wrong"}
          </div>
        </div>
      </div>
      {caption && <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800">{caption}</div>}
      {log.length > 0 && (
        <ul className="space-y-1 text-sm">
          {log.map((l, i) => (
            <li key={i} className={l.kind === "warn" ? "text-red-600" : "text-teal-700"}>{l.text}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
