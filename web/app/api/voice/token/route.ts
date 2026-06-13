import { getMedications, getAlerts } from "@/lib/hx";

export const runtime = "nodejs";

const MODEL = process.env.HX_VOICE_MODEL || "grok-voice-think-fast-1.1";

// The voice agent is grounded in Maria's real record from our engine, so
// "talk to your repo" works conversationally (no function calls needed yet).
function buildInstructions(): string {
  const meds = getMedications();
  const alerts = getAlerts();
  const medLines = meds
    .map((m) => `- ${m.name} ${m.dose} for ${m.reason} (added by ${m.providerName} on ${m.date})`)
    .join("\n");
  const alertLines = alerts.map((a) => `- ${a.title}: ${a.explanation}`).join("\n");

  return [
    "You are Hx, Maria Reyes's own health assistant, speaking with her by voice.",
    "Be warm, calm, and brief. Answer in 1–3 short sentences. Speak whatever language Maria speaks.",
    "Start by briefly greeting her by name and asking how her recent visit went.",
    "Maria's current medications:\n" + medLines,
    alerts.length ? "Active safety concerns:\n" + alertLines : "No active safety concerns.",
    "If she asks whether her medicines are safe together, explain the serotonin syndrome risk between tramadol and sertraline, name who prescribed each, and tell her to call her doctor. Never tell her to stop a medicine on her own. You are not a doctor; for anything urgent advise contacting a clinician.",
  ].join("\n\n");
}

export async function GET() {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    return Response.json({ error: "XAI_API_KEY not set (put it in web/.env.local)" }, { status: 500 });
  }
  const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expires_after: { seconds: 600 } }),
  });
  if (!r.ok) {
    const detail = await r.text();
    return Response.json({ error: "token mint failed", detail }, { status: 502 });
  }
  const data = await r.json();
  return Response.json({
    token: data.value,
    expiresAt: data.expires_at,
    model: MODEL,
    instructions: buildInstructions(),
  });
}
