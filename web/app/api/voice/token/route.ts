import { buildVoiceInstructions, voiceModel } from "@/lib/hx/voice";

export const runtime = "nodejs";

// Mints a short-lived ephemeral token so the browser can open the realtime
// WebSocket without ever seeing the raw API key.
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
    model: voiceModel(),
    instructions: buildVoiceInstructions(),
  });
}
