import { getMedications, getAlerts } from "./index";

const MODEL = process.env.HX_VOICE_MODEL || "grok-voice-think-fast-1.1";

export function voiceModel() {
  return MODEL;
}

// Grounds the voice agent in Maria's real record from the engine. Shared by the
// in-app token route and the phone bridge (single source of truth).
export function buildVoiceInstructions(): string {
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
    "If she describes a new appointment or visit, call the add_visit tool to save it to her record — extract a short title, the place, the provider, the date, a one-sentence summary, and any new medicines (name, dose, reason). After it saves, confirm briefly and warn her if it introduces a drug interaction.",
  ].join("\n\n");
}
