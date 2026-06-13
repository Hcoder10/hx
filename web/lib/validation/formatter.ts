import { Candidate, CodedEntry, RawItem } from "./model";

// STAGE 3 — FORMAT (the only LLM step)
//
// Grok maps messy free text + retrieved candidate codes -> a structured CodedEntry.
// Today the model is Grok; a fine-tuned 9B Qwen 3.5 drops into this same slot later
// with no change to the prompt contract. The model is NOT trusted: stage 4 (verify)
// independently re-checks every code it returns. The model's job is only to PICK
// among the retrieved candidates (or abstain), never to invent a code.
//
// This file exports the exact prompt string and the (de)serialization helpers. The
// actual network call lives at the call site (mirrors how voice.ts builds
// instructions but leaves transport to the route), so this module stays pure.

// The EXACT system prompt handed to Grok. Kept as a single const string so it can
// be snapshot-tested and so the fine-tuned model trains against identical wording.
export const GROK_FORMATTER_PROMPT = `You are Hx's medical coding formatter. You convert one messy, free-text clinical item from a patient's record into a single structured, coded entry, choosing ONLY from a provided list of candidate codes.

You will receive a JSON object:
{
  "section": "problems" | "medications" | "allergies" | "vitals",
  "system": "ICD10" | "RXNORM" | "LOINC" | "UNII",
  "text": "the messy provider phrasing to be coded",
  "fields": { ... optional dose/reason/reaction/value/unit already parsed ... },
  "candidates": [ { "code": "...", "description": "...", "aliases": ["..."], "score": 0.0 }, ... ]
}

Your task: pick the ONE candidate whose description/aliases best mean the same clinical concept as "text", and return it as a coded entry.

Rules — follow EXACTLY:
1. Choose "code" ONLY from the provided candidates. Never output a code that is not in the candidate list. Never modify, complete, or guess a code.
2. If NO candidate is a correct match for the term, abstain: return "code": "" . Abstaining is correct and safe; a wrong code is worse than none.
3. "term" MUST be the plain human term the chosen code stands for — use the candidate's description (or a faithful normalization of "text"). Do NOT put a code, abbreviation, or invented label in "term".
4. Do NOT add, drop, or alter any value in "fields". Copy it through unchanged.
5. Match meaning, not surface spelling. "high blood pressure (hypertension)" matches an "Essential (primary) hypertension" candidate. "muscular chest pain" describing pain ruled non-cardiac matches "Myalgia", not "Chest pain", only if the candidates support it.
6. Prefer the most specific candidate the text actually SUPPORTS. For a general lay term, pick the general / "unspecified" form (e.g. "the flu" -> an unspecified influenza code; "kidney infection" -> "Acute pyelonephritis", NOT a pregnancy-specific one). Do not invent specificity the text doesn't state.
7. NEVER choose a candidate scoped to pregnancy, childbirth, the puerperium, the newborn/perinatal period, a screening/exposure/contact "encounter", or an external cause (injury mechanism) UNLESS the text explicitly says so. A plain symptom or disease name maps to the plain diagnosis code.
8. Output ONLY a single JSON object, no prose, no code fences, in EXACTLY this shape:
{ "section": "...", "system": "...", "code": "...", "term": "...", "fields": { ... } }

Remember: a downstream deterministic verifier will reject your entry unless the code exists in the public code set AND its official description fuzzy-matches your "term". So pick a real candidate whose description genuinely matches, or abstain.`;

// QUERY REWRITE prompt (used only when lexical retrieval over the full code set
// finds nothing strong — i.e. the input is colloquial). The model translates the
// casual phrasing into the standard clinical term so the SAME pure lexical
// retrieval can surface the right candidates. The model supplies vocabulary only;
// it never names a code, and the verifier still gates whatever gets coded.
export const GROK_REWRITE_PROMPT = `You translate a patient's or provider's casual phrasing of a health problem, medication, allergy, or vital sign into the standard CLINICAL term used in medical coding (ICD-10-CM / RxNorm / LOINC).

You receive a JSON object: { "text": "...the casual phrasing..." }

Reply with ONLY the clinical term(s) as a short phrase. No code, no explanation, no quotes, no punctuation beyond what the term needs. If the text is already a clinical term, return it unchanged. If you genuinely cannot map it, repeat the input text.

Examples:
{"text":"wants to kill themselves"} -> suicidal ideation
{"text":"feeling really down lately"} -> major depressive disorder
{"text":"can't stop worrying"} -> generalized anxiety disorder
{"text":"high BP"} -> essential hypertension
{"text":"sugar problem"} -> type 2 diabetes mellitus
{"text":"water pill"} -> hydrochlorothiazide
{"text":"heart racing"} -> tachycardia
{"text":"trouble breathing"} -> dyspnea
{"text":"can't sleep"} -> insomnia`;

// Build the per-item user payload Grok sees. One item per call keeps each decision
// isolated and the prompt small (cheap + steerable for the 9B model later).
export function buildFormatterInput(item: RawItem, candidates: Candidate[]) {
  return {
    section: item.section,
    system: item.system,
    text: item.text,
    fields: item.fields ?? {},
    candidates: candidates.map((c) => ({
      code: c.code,
      description: c.description,
      aliases: c.aliases ?? [],
      score: Number(c.score.toFixed(3)),
    })),
  };
}

// Parse Grok's reply into a CodedEntry, re-attaching provenance from the source
// item (never trust the model to echo provenance) and defaulting safely. Throws
// nothing: malformed output becomes an abstention, which the verifier flags.
export function parseFormatterOutput(raw: string, item: RawItem): CodedEntry {
  const base: CodedEntry = {
    section: item.section,
    system: item.system,
    code: "",
    term: item.text,
    fields: item.fields,
    source: item.source,
  };

  let obj: unknown;
  try {
    // tolerate accidental code fences / surrounding whitespace
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    obj = JSON.parse(cleaned);
  } catch {
    return base; // unparsable -> abstain -> verifier flags "no_code"
  }

  if (!obj || typeof obj !== "object") return base;
  const o = obj as Record<string, unknown>;

  return {
    ...base,
    code: typeof o.code === "string" ? o.code.trim() : "",
    term: typeof o.term === "string" && o.term.trim() ? o.term.trim() : item.text,
    // fields are authoritative from the chunker, not the model — keep ours.
    fields: item.fields,
  };
}
