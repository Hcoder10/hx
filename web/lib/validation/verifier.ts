import { CodedEntry, VerifiedEntry, VerifyReason } from "./model";
import { findCode } from "./code-sets";
import { bestSimilarity } from "./text";

// STAGE 4 — VERIFY  (DETERMINISTIC. NO ML. NO DEPS. FAST.)
//
// The trust boundary. Grok (or any future model) is untrusted: this gate decides
// whether a coded entry may be written to the record. It accepts an entry ONLY if
// BOTH hold:
//   (A) the code EXISTS in the public code set for the entry's system, AND
//   (B) that code's OFFICIAL description (or an alias) fuzzy-matches the term the
//       model claimed the code stands for, at/above a threshold.
// Otherwise the entry is flagged with a machine-readable reason + human note.
//
// Properties (by construction):
//   • Deterministic — same input always yields the same verdict (pure functions
//     over a static code set; no clocks, no randomness, no I/O).
//   • Dependency-free — only imports our own pure text + code-set modules.
//   • Fast — one hash-style lookup + a handful of bigram/Jaccard comparisons per
//     entry; O(aliases) work, no search, no allocation beyond small sets.
//   • Independent of retrieval — it does NOT trust that the code "came from" the
//     candidate list; it re-derives existence and match from the public set itself.

// Minimum similarity between the claimed term and the code's official description
// (or any alias) to accept. 0.55 comfortably accepts genuine matches in the demo
// ("high blood pressure" vs "Essential (primary) hypertension" via the alias) while
// rejecting unrelated pairings. Exported so tests / tuning can reference it.
export const MATCH_THRESHOLD = 0.55;

const codeOf = (e: CodedEntry) => (e.code || "").trim();

// Everything a verdict carries except the gate-specific reason/note/similarity.
type VerdictBase = CodedEntry & { accepted: boolean; similarity: number; matchedDescription?: string };

// Verify a single coded entry. Pure: no side effects, total (never throws).
export function verifyEntry(entry: CodedEntry, threshold = MATCH_THRESHOLD): VerifiedEntry {
  const base: VerdictBase = { ...entry, accepted: false, similarity: 0 };

  // Gate 0: the model abstained (or produced nothing usable).
  if (!codeOf(entry)) {
    return flag(base, "no_code", `No code was assigned for "${entry.term}". Needs manual coding.`);
  }

  // Gate A: the code must EXIST in the public set for this section's system.
  const match = findCode(entry.system, codeOf(entry));
  if (!match) {
    return flag(
      base,
      "code_not_found",
      `Code ${entry.code} does not exist in ${entry.system}. Refusing to record an unverifiable code.`,
    );
  }

  // Defensive: the code exists but in a different system than the entry claims.
  // (findCode already scopes by system, so this is belt-and-suspenders for the
  // case where an entry is constructed with mismatched system/code by hand.)
  if (match.system !== entry.system) {
    return flag(
      base,
      "system_mismatch",
      `Code ${entry.code} belongs to ${match.system}, not ${entry.system}.`,
    );
  }

  // Gate B: the code's OFFICIAL description (or alias) must fuzzy-match the claimed
  // term. We compare against the public description we just looked up — NOT against
  // any text the model supplied — so the model cannot talk its way past the gate.
  const similarity = bestSimilarity(entry.term, match.description, match.aliases);
  if (similarity < threshold) {
    return flag(
      { ...base, matchedDescription: match.description },
      "weak_match",
      `Code ${entry.code} ("${match.description}") does not match the claimed term "${entry.term}" ` +
        `(similarity ${similarity.toFixed(2)} < ${threshold}).`,
      similarity,
    );
  }

  // Accepted: real code + matching description.
  return {
    ...entry,
    accepted: true,
    reason: "ok",
    matchedDescription: match.description,
    similarity,
  };
}

function flag(
  base: VerdictBase,
  reason: VerifyReason,
  note: string,
  similarity = base.similarity,
): VerifiedEntry {
  return { ...base, accepted: false, reason, note, similarity };
}

// Verify a batch. Returns the verdicts in input order plus a tiny summary so the
// caller can decide whether to write the commit, surface a review queue, etc.
export function verifyEntries(
  entries: CodedEntry[],
  threshold = MATCH_THRESHOLD,
): { results: VerifiedEntry[]; accepted: VerifiedEntry[]; flagged: VerifiedEntry[] } {
  const results = entries.map((e) => verifyEntry(e, threshold));
  const accepted = results.filter((r) => r.accepted);
  const flagged = results.filter((r) => !r.accepted);
  return { results, accepted, flagged };
}
