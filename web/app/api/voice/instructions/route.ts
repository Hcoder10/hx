import { buildVoiceInstructions, voiceModel } from "@/lib/hx/voice";

export const runtime = "nodejs";

// Read by the phone bridge so the telephony agent is grounded in Maria's record.
export async function GET() {
  return Response.json({ instructions: buildVoiceInstructions(), model: voiceModel() });
}
