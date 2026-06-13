import { Candidate, CodeEntry, CodeSystem, RawItem } from "./model";
import { codeSet } from "./code-sets";
import { bestSimilarity, normalize, tokens } from "./text";

// STAGE 2 — RETRIEVE
//
// For one free-text RawItem, find the top-K candidate public codes to hand to the
// formatter LLM. Pure, dependency-free RAG: lexical token overlap + fuzzy
// (bigram/Jaccard) matching over each code's description AND aliases.
//
// Two regimes, picked by set size:
//   • SMALL set (RxNorm/LOINC/UNII, ~hundreds): score every entry — a linear scan
//     is instant and maximally recall-friendly.
//   • BIG set (ICD-10-CM, ~71.7k): an inverted index (token -> code ids) built once
//     prefilters to entries that share a token with the term, then we fuzzy-score
//     only those. Scoring all 71.7k per item would be too slow on serverless.
//
// A purely lexical term that shares NO token with the right code (colloquial
// phrasing like "wants to kill themselves") yields a weak/empty result here — that
// is intentional: the pipeline (index.ts) detects the weak score and asks the LLM
// to rewrite the term into a clinical phrase, then retrieves again. So this stage
// stays pure and deterministic; the LLM only supplies vocabulary, never codes.

const DEFAULT_K = 25;
const SMALL_SET = 600; // at/below this, score every entry (no index needed)
const PREFILTER = 300; // fuzzy-score at most this many overlap candidates
const COMMON_DF = 6000; // ignore tokens appearing in more entries than this (e.g. "unspecified")

type InvertedIndex = { entries: CodeEntry[]; postings: Map<string, number[]> };
const indexCache = new Map<CodeSystem, InvertedIndex>();

function indexFor(system: CodeSystem): InvertedIndex {
  const cached = indexCache.get(system);
  if (cached) return cached;
  const entries = codeSet(system);
  const postings = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const haystack = normalize([e.description, ...(e.aliases ?? [])].join(" "));
    for (const t of new Set(haystack.split(" ").filter(Boolean))) {
      let arr = postings.get(t);
      if (!arr) postings.set(t, (arr = []));
      arr.push(i);
    }
  });
  const built = { entries, postings };
  indexCache.set(system, built);
  return built;
}

// Score a single code entry against the term: fuzzy match vs description + aliases
// (main signal) blended with a lexical bonus for verbatim token hits. Deterministic.
function scoreEntry(term: string, entry: CodeEntry): number {
  const fuzzy = bestSimilarity(term, entry.description, entry.aliases);

  const termTokens = tokens(term);
  const hay = normalize([entry.description, ...(entry.aliases ?? [])].join(" "));
  const haySet = new Set(hay.split(" "));
  const hits = termTokens.filter((t) => haySet.has(t)).length;
  const lexical = termTokens.length ? hits / termTokens.length : 0;

  return Math.min(1, 0.7 * fuzzy + 0.3 * lexical);
}

// Top-K candidates for one item, sorted by score desc. Ties broken by shorter
// description (more specific) then code, so ordering is fully deterministic.
export function retrieveCandidates(item: RawItem, k = DEFAULT_K): Candidate[] {
  const { entries, postings } = indexFor(item.system);

  // Choose the candidate pool: full scan for small sets, token-overlap prefilter
  // for big ones.
  let pool: number[];
  if (entries.length <= SMALL_SET) {
    pool = entries.map((_, i) => i);
  } else {
    const overlap = new Map<number, number>();
    for (const t of new Set(tokens(item.text))) {
      const arr = postings.get(t);
      if (!arr || arr.length > COMMON_DF) continue; // skip too-common (noise) tokens
      for (const i of arr) overlap.set(i, (overlap.get(i) ?? 0) + 1);
    }
    pool = [...overlap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, PREFILTER)
      .map(([i]) => i);
  }

  const scored: Candidate[] = pool.map((i) => ({ ...entries[i], score: scoreEntry(item.text, entries[i]) }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.description.length - b.description.length ||
      a.code.localeCompare(b.code),
  );
  return scored.slice(0, k);
}

// Convenience: retrieve candidates for every item in a chunked record.
export function retrieveAll(
  items: RawItem[],
  k = DEFAULT_K,
): { item: RawItem; candidates: Candidate[] }[] {
  return items.map((item) => ({ item, candidates: retrieveCandidates(item, k) }));
}
