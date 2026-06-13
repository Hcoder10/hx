import { Candidate, CodeEntry, RawItem } from "./model";
import { codeSet } from "./code-sets";
import { bestSimilarity, normalize, tokens } from "./text";

// STAGE 2 — RETRIEVE
//
// For one free-text RawItem, find the top-K candidate public codes to hand to
// Grok. Pure, dependency-free RAG: lexical token overlap + fuzzy (bigram/Jaccard)
// matching over each code's canonical description AND its aliases. No embeddings,
// no index build — the code sets are tiny, so a linear scan with a good scorer is
// both correct and instant.
//
// Why retrieve at all if the verifier re-checks later? Two reasons:
//   1. It constrains Grok to real codes, cutting hallucination at the source.
//   2. The verifier becomes a pure containment+similarity gate (no search), which
//      keeps it trivially deterministic and fast.

// The demo code sets are tiny (~100/system), so we hand Grok ALL of them (ranked
// by lexical score) and let its semantics pick — robust to colloquial phrasing the
// lexical scorer misses. At production scale (tens of thousands of codes) this won't
// fit a prompt; that's where semantic retrieval (embeddings) becomes necessary.
const DEFAULT_K = 150;

// Score a single code entry against the term. The score blends:
//   • bestSimilarity — fuzzy match vs description + aliases (the main signal)
//   • lexical bonus  — fraction of the term's tokens that appear verbatim in the
//                      description/aliases (rewards exact word hits like "diabetes")
// Deterministic; same term + entry always yields the same number.
function scoreEntry(term: string, entry: CodeEntry): number {
  const fuzzy = bestSimilarity(term, entry.description, entry.aliases);

  const termTokens = tokens(term);
  const hay = normalize([entry.description, ...(entry.aliases ?? [])].join(" "));
  const haySet = new Set(hay.split(" "));
  const hits = termTokens.filter((t) => haySet.has(t)).length;
  const lexical = termTokens.length ? hits / termTokens.length : 0;

  // Weighted blend, fuzzy-dominant. Clamp to [0,1].
  return Math.min(1, 0.7 * fuzzy + 0.3 * lexical);
}

// Top-K candidates for one item, sorted by score desc. Ties broken by shorter
// description (more specific) then code, so ordering is fully deterministic.
export function retrieveCandidates(item: RawItem, k = DEFAULT_K): Candidate[] {
  const term = item.text;
  const scored: Candidate[] = codeSet(item.system).map((entry) => ({
    ...entry,
    score: scoreEntry(term, entry),
  }));

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.description.length - b.description.length ||
      a.code.localeCompare(b.code),
  );

  // Return all candidates (ranked), not just lexical hits: a colloquial term scores
  // ~0 against the right code's description, so dropping zero-score entries would
  // hide it from Grok. With a tiny set we can afford to pass them all.
  return scored.slice(0, k);
}

// Convenience: retrieve candidates for every item in a chunked record, keyed for
// the formatter prompt. Returns a flat list preserving section + provenance.
export function retrieveAll(
  items: RawItem[],
  k = DEFAULT_K,
): { item: RawItem; candidates: Candidate[] }[] {
  return items.map((item) => ({ item, candidates: retrieveCandidates(item, k) }));
}
