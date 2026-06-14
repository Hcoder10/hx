// Role-based voice agents for the Legion-style psychiatry demo. Two agents, one
// realtime client: a PATIENT agent (warm check-ins + measurement-based care) and a
// PROVIDER agent (the psychiatrist dictates assessment / prescribing / plan). Both
// commit visits to the patient's repo through the Hub APIs and run the same
// RAG+Grok coding + interaction-safety + negation-aware pipeline.
//
// This module is pure: instruction builders + tool schemas + assessment scoring.
// Transport (the realtime socket) + tool execution live in the call client; the
// token/instructions routes build the VoiceContext and pick the role's tools.

export type VoiceRole = "patient" | "provider";

export type VoiceMed = { name: string; dose: string; reason: string; providerName: string; date: string };
export type VoiceContext = {
  role: VoiceRole;
  patientName: string;
  providerName?: string; // when role=provider
  providerRole?: string; // e.g. "Psychiatry"
  repoId: string; // the thread being worked in
  repoName: string;
  meds: VoiceMed[];
  alerts: { title: string; explanation: string }[];
  recentVisits?: { title: string; date: string; author: string }[];
  assessments?: { instrument: string; score: number; severity: string; date: string }[];
};

// ---- Measurement-based care: PHQ-9 (depression) + GAD-7 (anxiety) ----------
// Each item is scored 0–3 ("not at all" → "nearly every day"). Short-form (first
// 3 items) is used for the timed demo so the agent isn't reading all 9 aloud.
export const PHQ9 = {
  instrument: "PHQ-9",
  measures: "depression",
  scale: '0 = "not at all", 1 = "several days", 2 = "more than half the days", 3 = "nearly every day"',
  items: [
    "Little interest or pleasure in doing things",
    "Feeling down, depressed, or hopeless",
    "Trouble falling or staying asleep, or sleeping too much",
    "Feeling tired or having little energy",
    "Poor appetite or overeating",
    "Feeling bad about yourself, or that you are a failure",
    "Trouble concentrating on things",
    "Moving or speaking slowly, or being restless",
    "Thoughts that you would be better off dead or of hurting yourself",
  ],
  max: 27,
};

export const GAD7 = {
  instrument: "GAD-7",
  measures: "anxiety",
  scale: '0 = "not at all", 1 = "several days", 2 = "more than half the days", 3 = "nearly every day"',
  items: [
    "Feeling nervous, anxious, or on edge",
    "Not being able to stop or control worrying",
    "Worrying too much about different things",
    "Trouble relaxing",
    "Being so restless that it's hard to sit still",
    "Becoming easily annoyed or irritable",
    "Feeling afraid as if something awful might happen",
  ],
  max: 21,
};

export function scoreSeverity(instrument: "PHQ-9" | "GAD-7", score: number): string {
  if (instrument === "PHQ-9") {
    if (score >= 20) return "severe";
    if (score >= 15) return "moderately severe";
    if (score >= 10) return "moderate";
    if (score >= 5) return "mild";
    return "minimal";
  }
  if (score >= 15) return "severe";
  if (score >= 10) return "moderate";
  if (score >= 5) return "mild";
  return "minimal";
}

// Short-form item lists for the 3-minute demo (the agent asks these aloud, then
// extrapolates a full-scale score). Item 9 of PHQ-9 (self-harm) is always included.
function shortForm(instr: typeof PHQ9 | typeof GAD7): string {
  const items = instr === PHQ9 ? [PHQ9.items[0], PHQ9.items[1], PHQ9.items[8]] : [GAD7.items[0], GAD7.items[1], GAD7.items[2]];
  return items.map((q, i) => `  ${i + 1}. ${q}`).join("\n");
}

function ground(ctx: VoiceContext): string {
  const meds = ctx.meds.length
    ? ctx.meds.map((m) => `- ${m.name} ${m.dose} for ${m.reason} (by ${m.providerName}, ${m.date})`).join("\n")
    : "- (none on record)";
  const alerts = ctx.alerts.length
    ? ctx.alerts.map((a) => `- ${a.title}: ${a.explanation}`).join("\n")
    : "- none";
  const scores = (ctx.assessments ?? []).length
    ? ctx.assessments!.map((a) => `- ${a.instrument} ${a.score} (${a.severity}) on ${a.date}`).join("\n")
    : "- none recorded yet";
  return `PATIENT: ${ctx.patientName}  ·  THREAD: ${ctx.repoName}\nCURRENT MEDICATIONS:\n${meds}\nSAFETY ALERTS:\n${alerts}\nRECENT ASSESSMENT SCORES:\n${scores}`;
}

// ---- PATIENT agent --------------------------------------------------------
export function buildPatientAgentInstructions(ctx: VoiceContext, opts: { demoShort?: boolean } = {}): string {
  const phq = opts.demoShort ? shortForm(PHQ9) : PHQ9.items.map((q, i) => `  ${i + 1}. ${q}`).join("\n");
  const gad = opts.demoShort ? shortForm(GAD7) : GAD7.items.map((q, i) => `  ${i + 1}. ${q}`).join("\n");
  return [
    `You are Hx, ${ctx.patientName}'s own mental-health companion, speaking with her by voice. You support an AI-augmented psychiatry practice (measurement-based care).`,
    "Be warm, calm, validating, and brief — 1–3 short sentences per turn. Speak whatever language she speaks. You are NOT a doctor; for anything urgent or any mention of self-harm, gently urge her to contact her clinician or a crisis line (988 in the US) right away.",
    "Greet her by name and ask how she's been since her last visit.",
    ground(ctx),
    `MEASUREMENT-BASED CHECK-IN: When she wants a check-in or describes how she's feeling, administer a brief assessment by voice. For low mood use PHQ-9; for worry/anxiety use GAD-7. Ask each item and have her rate it ${PHQ9.scale}. ${opts.demoShort ? "Ask only these items (short check-in):" : "Items:"}\nPHQ-9 (depression):\n${phq}\nGAD-7 (anxiety):\n${gad}\nThen tell her the total and what it means, and call record_assessment with the instrument and total score.`,
    "If item 9 (thoughts of self-harm) is anything but 'not at all', stop the scoring, respond with care, and tell her to contact her clinician or 988 now.",
    "NEGATION: if she says she is NOT having a symptom (e.g. 'I'm not having suicidal thoughts'), record it as a NEGATIVE finding — never log it as if present.",
    "Use log_checkin to save a short visit with her reported symptoms, side effects, and mood. Keep entries small — a check-in is a small commit, not a full encounter.",
    "If she asks whether her medicines are safe together, use the SAFETY ALERTS above: name the medicines and who prescribed each, and tell her to call her doctor. Never tell her to stop a medicine on her own.",
  ].join("\n\n");
}

// ---- PROVIDER agent -------------------------------------------------------
export function buildProviderAgentInstructions(ctx: VoiceContext): string {
  return [
    `You are the Hx clinical scribe for ${ctx.providerName ?? "the clinician"} (${ctx.providerRole ?? "Psychiatry"}), working in ${ctx.patientName}'s "${ctx.repoName}" thread. You let the psychiatrist run a visit hands-free.`,
    "Be concise and clinical. Confirm key actions back in one line. You assist documentation and coding; the clinician makes all decisions.",
    ground(ctx),
    "When asked to summarize the patient, give a tight readout: latest PHQ-9/GAD-7 scores and trend, current medications with prescribers, and any active interaction alerts.",
    "ASSESSMENT/DIAGNOSIS: when the clinician states findings or a diagnosis, capture them. They will be coded to ICD-10 (mental-health F-codes) by the downstream pipeline — you just record the plain clinical terms. NEGATION matters: 'not suicidal', 'no manic symptoms', 'rule out bipolar' must be recorded as negative/ruled-out, NEVER coded as present.",
    "PRESCRIBING: when the clinician starts, adjusts, or stops a medication, call prescribe with the drug name, dose, reason, and action (start/adjust/stop). The system checks interactions against the patient's full record FIRST — if it returns a warning (e.g. serotonin syndrome with an existing medicine), READ THE WARNING ALOUD and ask the clinician to confirm before it is committed.",
    "COMMIT: when the visit is done, call commit_visit with a short title, a one-line summary, the diagnoses (plain terms), the medication changes, and any notes. This writes one commit to the patient's thread, authored by the clinician. Small updates (a lab result, a single note) are fine as their own small commit.",
  ].join("\n\n");
}

export function buildAgentInstructions(ctx: VoiceContext, opts: { demoShort?: boolean } = {}): string {
  return ctx.role === "provider" ? buildProviderAgentInstructions(ctx) : buildPatientAgentInstructions(ctx, opts);
}

// ---- Realtime function tools (Grok realtime / OpenAI-realtime schema) ------
const t = (name: string, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: "function" as const,
  name,
  description,
  parameters: { type: "object", properties, required, additionalProperties: false },
});

export const PATIENT_TOOLS = [
  t(
    "record_assessment",
    "Save a completed PHQ-9 or GAD-7 self-assessment score for the patient.",
    {
      instrument: { type: "string", enum: ["PHQ-9", "GAD-7"] },
      score: { type: "number", description: "total score" },
      note: { type: "string", description: "one-line context, optional" },
    },
    ["instrument", "score"],
  ),
  t(
    "log_checkin",
    "Save a small check-in visit to the patient's thread: reported symptoms, side effects, mood. Keep it small.",
    {
      summary: { type: "string", description: "one-sentence plain summary" },
      symptoms: { type: "array", items: { type: "string" }, description: "reported symptoms (positive findings only)" },
      side_effects: { type: "array", items: { type: "string" } },
      negatives: { type: "array", items: { type: "string" }, description: "things the patient explicitly does NOT have (e.g. 'not suicidal')" },
    },
    ["summary"],
  ),
  t("check_meds", "Check whether the patient's current medications are safe together.", {}, []),
];

export const PROVIDER_TOOLS = [
  t("get_summary", "Get a clinical summary: latest scores, medications, and active interaction alerts.", {}, []),
  t(
    "prescribe",
    "Start, adjust, or stop a medication. Runs an interaction check against the full record and returns any warnings BEFORE committing.",
    {
      name: { type: "string" },
      dose: { type: "string" },
      reason: { type: "string" },
      action: { type: "string", enum: ["start", "adjust", "stop"] },
    },
    ["name", "action"],
  ),
  t(
    "commit_visit",
    "Write one visit (commit) to the patient's thread, authored by the clinician. Diagnoses are plain terms (coded downstream); negated findings are recorded as ruled-out.",
    {
      title: { type: "string" },
      summary: { type: "string" },
      diagnoses: { type: "array", items: { type: "string" } },
      medications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            dose: { type: "string" },
            reason: { type: "string" },
            action: { type: "string", enum: ["start", "adjust", "stop"] },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
      notes: { type: "array", items: { type: "string" } },
    },
    ["title", "summary"],
  ),
];

export function toolsForRole(role: VoiceRole) {
  return role === "provider" ? PROVIDER_TOOLS : PATIENT_TOOLS;
}
