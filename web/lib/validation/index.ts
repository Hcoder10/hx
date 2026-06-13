import { Encounter } from "@/lib/hx";
import { Candidate, CodedEntry, RawItem, VerifiedEntry } from "./model";
import { chunkEncounter } from "./chunker";
import { retrieveCandidates } from "./retrieval";
import {
  GROK_FORMATTER_PROMPT,
  GROK_REWRITE_PROMPT,
  buildFormatterInput,
  parseFormatterOutput,
} from "./formatter";
import { verifyEntries } from "./verifier";

export * from "./model";
export { chunkEncounter, chunkMarkdown, SECTION_SCHEMAS } from "./chunker";
export { retrieveCandidates, retrieveAll } from "./retrieval";
export {
  GROK_FORMATTER_PROMPT,
  GROK_REWRITE_PROMPT,
  buildFormatterInput,
  parseFormatterOutput,
} from "./formatter";
export { verifyEntry, verifyEntries, MATCH_THRESHOLD } from "./verifier";
export { codeSet, findCode, SECTION_SYSTEM } from "./code-sets";

// The LLM seam. The pipeline takes a callback that, given a prompt and a JSON
// payload, returns the model's raw text reply. Today it wraps a Grok chat call;
// later the fine-tuned 9B Qwen. Stages 1/2/4 stay pure so the whole pipeline is
// unit-testable with a fake model.
export type GrokFormat = (prompt: string, payload: unknown) => Promise<string>;

// At/above this top-candidate score the term is already clinical enough that the
// lexical hit is trustworthy; below it we also ask the model to rewrite the term
// into a clinical phrase and MERGE the extra candidates (colloquial inputs like
// "the flu" or "pink eye" score low against official descriptions).
const STRONG_SCORE = 0.85;
const MERGE_K = 25;

// Ask the model for the clinical term behind colloquial text. Returns "" on any
// problem (so retrieval just keeps its original candidates — fail-safe).
async function clinicalRewrite(format: GrokFormat, text: string): Promise<string> {
  try {
    const raw = await format(GROK_REWRITE_PROMPT, { text });
    const t = (raw || "").trim().replace(/^["']+|["']+$/g, "").split("\n")[0].trim();
    return t.length > 1 && t.length <= 120 ? t : "";
  } catch {
    return "";
  }
}

// Retrieve candidates for one item. If the lexical match isn't strong, also rewrite
// the term to a clinical phrase and MERGE both candidate lists (dedup by code,
// keep best score) so the formatter sees real codes for both the literal phrasing
// and its clinical synonym. The ORIGINAL text is still what gets coded — the
// rewrite only widens which real codes are shown.
//
// Exported so routes that run the format step themselves (e.g. /api/validate, which
// adds a tamper toggle) still get the rewrite-aware candidates instead of bare
// lexical retrieval.
export async function retrieveWithRewrite(item: RawItem, format: GrokFormat): Promise<Candidate[]> {
  return candidatesFor(item, format);
}

async function candidatesFor(item: RawItem, format: GrokFormat): Promise<Candidate[]> {
  const base = retrieveCandidates(item);
  if (base.length > 0 && base[0].score >= STRONG_SCORE) return base;

  const clinical = await clinicalRewrite(format, item.text);
  if (!clinical || clinical.toLowerCase() === item.text.toLowerCase()) return base;

  const alt = retrieveCandidates({ ...item, text: clinical });
  const byCode = new Map<string, Candidate>();
  for (const c of [...base, ...alt]) {
    const key = c.code.toUpperCase();
    const prev = byCode.get(key);
    if (!prev || c.score > prev.score) byCode.set(key, c);
  }
  return [...byCode.values()].sort((a, b) => b.score - a.score).slice(0, MERGE_K);
}

// Run the full pipeline over one record: chunk -> retrieve (+rewrite) -> format -> verify.
export async function validateRecord(
  e: Encounter,
  format: GrokFormat,
): Promise<{ results: VerifiedEntry[]; accepted: VerifiedEntry[]; flagged: VerifiedEntry[] }> {
  const chunked = chunkEncounter(e);
  const items: RawItem[] = chunked.sections.flatMap((s) => s.items);

  // Per-item work is independent; run it in parallel so latency stays ~one or two
  // model calls deep even for many items.
  const coded: CodedEntry[] = await Promise.all(
    items.map(async (item) => {
      const candidates = await candidatesFor(item, format);
      const raw = await format(GROK_FORMATTER_PROMPT, buildFormatterInput(item, candidates));
      return parseFormatterOutput(raw, item);
    }),
  );

  return verifyEntries(coded);
}
