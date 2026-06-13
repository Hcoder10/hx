// Shared types for the Hx data-validation pipeline. Synthetic data only.
//
// The pipeline turns one git commit / encounter record (messy provider free text)
// into structured, *coded* clinical entries that downstream features (alerts,
// interaction checks, the next-appointment recommender) can trust:
//
//   (1) chunk   — split a record into typed sections (problems / meds / ...)
//   (2) retrieve — find candidate public codes for each free-text item
//   (3) format   — Grok maps {text + candidates} -> a coded entry  (LLM, swappable)
//   (4) verify   — deterministic gate: accept only if the code is real AND its
//                  description fuzzy-matches the claimed term, else flag it
//
// Stages 1, 2, 4 are pure, dependency-free functions. Stage 3 is the only LLM
// call; today it's Grok, later a fine-tuned 9B Qwen 3.5 drops into the same slot.

// The clinical domains we extract. Each maps to one section schema below.
export type SectionKind = "problems" | "medications" | "allergies" | "vitals";

// Which public code system a section is coded against. Synthetic, tiny subsets
// of the real systems live in code-sets.ts — enough to demo the gate honestly.
export type CodeSystem = "ICD10" | "RXNORM" | "LOINC" | "UNII";

// One row of a public code set: a stable code, a canonical description, and any
// aliases/synonyms a provider might actually type. Retrieval + verify read this.
export type CodeEntry = {
  system: CodeSystem;
  code: string;
  description: string;
  aliases?: string[];
};

// A raw free-text item pulled out of a record section by the chunker. `text` is
// the messy provider phrasing; `fields` carries section-specific scraps (dose,
// reaction, value, unit) that the chunker could parse without guessing a code.
export type RawItem = {
  section: SectionKind;
  system: CodeSystem; // which code set this section should be coded against
  text: string; // the term to be coded, e.g. "high blood pressure (hypertension)"
  fields?: Record<string, string>; // e.g. { dose: "10 mg" } or { reaction: "rash" }
  source: { encounterId: string; line: number }; // provenance for flagging
};

// Output of the chunker: typed sections, each with its raw items + the schema
// (the field keys) that section is allowed to carry. The schema is data, not a
// validator dep, so the verifier and tests can introspect it cheaply.
export type SectionSchema = { kind: SectionKind; system: CodeSystem; fields: string[] };
export type ChunkedRecord = {
  encounterId: string;
  sections: { schema: SectionSchema; items: RawItem[] }[];
};

// A scored code candidate for one RawItem (output of retrieval, input to Grok).
export type Candidate = CodeEntry & { score: number };

// What Grok returns per item: the code it chose plus the term it's claiming that
// code stands for. `term` is echoed back so the verifier can fuzzy-check the
// claim WITHOUT trusting Grok's free-text description.
export type CodedEntry = {
  section: SectionKind;
  system: CodeSystem;
  code: string; // the code Grok selected (or "" if it abstained)
  term: string; // the human term Grok says this code means
  fields?: Record<string, string>;
  source: { encounterId: string; line: number };
};

// Verifier verdict. `accepted` entries are safe to write to the record; flagged
// ones carry a machine-readable reason + a human note for review.
export type VerifyReason =
  | "ok"
  | "no_code" // Grok abstained / empty code
  | "code_not_found" // code does not exist in the public set
  | "system_mismatch" // code exists but in the wrong system for this section
  | "weak_match"; // code exists but description doesn't match the claimed term

export type VerifiedEntry = CodedEntry & {
  accepted: boolean;
  reason: VerifyReason;
  matchedDescription?: string; // canonical description we matched against
  similarity: number; // 0..1 fuzzy score actually achieved
  note?: string; // human-readable explanation when flagged
};
