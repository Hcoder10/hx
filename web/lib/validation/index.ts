import { Encounter } from "@/lib/hx";
import { CodedEntry, RawItem, VerifiedEntry } from "./model";
import { chunkEncounter } from "./chunker";
import { retrieveCandidates } from "./retrieval";
import { GROK_FORMATTER_PROMPT, buildFormatterInput, parseFormatterOutput } from "./formatter";
import { verifyEntries } from "./verifier";

export * from "./model";
export { chunkEncounter, chunkMarkdown, SECTION_SCHEMAS } from "./chunker";
export { retrieveCandidates, retrieveAll } from "./retrieval";
export { GROK_FORMATTER_PROMPT, buildFormatterInput, parseFormatterOutput } from "./formatter";
export { verifyEntry, verifyEntries, MATCH_THRESHOLD } from "./verifier";
export { codeSet, findCode, SECTION_SYSTEM } from "./code-sets";

// The LLM seam. The pipeline takes a callback that, given the formatter prompt and
// one item's JSON payload, returns Grok's raw text reply. Today that callback wraps
// a Grok chat call; later it wraps the fine-tuned 9B Qwen. Keeping it injected means
// stages 1/2/4 stay pure and the whole pipeline is unit-testable with a fake model.
export type GrokFormat = (prompt: string, payload: unknown) => Promise<string>;

// Run the full pipeline over one record: chunk -> retrieve -> format -> verify.
// Returns the per-item verdicts plus accepted/flagged splits from the verifier.
export async function validateRecord(
  e: Encounter,
  format: GrokFormat,
): Promise<{ results: VerifiedEntry[]; accepted: VerifiedEntry[]; flagged: VerifiedEntry[] }> {
  const chunked = chunkEncounter(e);
  const items: RawItem[] = chunked.sections.flatMap((s) => s.items);

  // Parallel: per-item format calls are independent; keeps latency ~1 call so the
  // gate fits within serverless time limits even for many items.
  const coded: CodedEntry[] = await Promise.all(
    items.map(async (item) => {
      const candidates = retrieveCandidates(item);
      const raw = await format(GROK_FORMATTER_PROMPT, buildFormatterInput(item, candidates));
      return parseFormatterOutput(raw, item);
    }),
  );

  return verifyEntries(coded);
}
