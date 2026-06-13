// Pure, dependency-free text utilities shared by retrieval and the verifier.
// Both stages must agree on what "matches" means, so the normalization and
// similarity functions live here once. No ML, no deps, fully deterministic.

// Lowercase, strip punctuation, collapse whitespace. Parenthetical glosses like
// "high blood pressure (hypertension)" survive as two tokens, which is what we
// want for matching.
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%./\s-]/g, " ") // keep %, ., /, - (doses, ratios, codes)
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

// Jaccard overlap on token *sets*. Order-independent and cheap. Good at catching
// "muscular chest pain" ~ "myalgia"? No — that's why we also do alias matching
// upstream. Jaccard's job is to reward shared significant words.
export function jaccard(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Bigram (character 2-gram) Dice coefficient. Catches typos and morphological
// drift ("hypertension" vs "hypertensive") that token Jaccard misses. Computed
// per-token-string on the normalized term.
function bigrams(s: string): Map<string, number> {
  const n = normalize(s).replace(/\s+/g, "");
  const m = new Map<string, number>();
  for (let i = 0; i < n.length - 1; i++) {
    const g = n.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

export function diceBigram(a: string, b: string): number {
  const ma = bigrams(a);
  const mb = bigrams(b);
  let total = 0;
  let inter = 0;
  for (const [, c] of ma) total += c;
  for (const [, c] of mb) total += c;
  if (total === 0) return 0;
  for (const [g, c] of ma) {
    const o = mb.get(g);
    if (o) inter += Math.min(c, o);
  }
  return (2 * inter) / total;
}

// Combined similarity in [0,1]: take the stronger of token-overlap and char
// bigram-overlap, then bonus for a full substring containment (a term fully
// contained in the description, e.g. "depression" within "...depressive...").
// Deterministic and monotonic — same inputs always yield the same score.
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const j = jaccard(na, nb);
  const d = diceBigram(na, nb);
  let s = Math.max(j, d);
  // Containment bonus: a short claimed term fully present in the description is a
  // strong signal even if the description is much longer (low Jaccard).
  if (nb.includes(na) || na.includes(nb)) s = Math.max(s, 0.9);
  return Math.min(1, s);
}

// Best similarity of a term against a canonical description OR any of its
// aliases. This is the single comparison both retrieval (ranking) and the
// verifier (gating) use, so a candidate scores the same in both stages.
export function bestSimilarity(term: string, description: string, aliases: string[] = []): number {
  let best = similarity(term, description);
  for (const a of aliases) best = Math.max(best, similarity(term, a));
  return best;
}
