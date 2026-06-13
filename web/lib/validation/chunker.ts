import { Encounter } from "@/lib/hx";
import { ChunkedRecord, RawItem, SectionKind, SectionSchema } from "./model";
import { SECTION_SYSTEM } from "./code-sets";

// STAGE 1 — CHUNK
//
// Split one commit/record (an Encounter) into typed sections, each with a schema
// (the field keys that section may carry) and a list of RawItems (messy free-text
// terms to be coded). Pure, deterministic, dependency-free.
//
// Two inputs are supported:
//   • chunkEncounter(e)   — the structured Encounter the app already has
//   • chunkMarkdown(...)  — the section markdown the git repo writes (medications.md,
//                           problems.md, allergies.md), for when we re-validate the
//                           committed files rather than the in-memory object.

// The per-section schemas. `fields` are the non-code scraps the chunker may parse
// out without guessing a code — the verifier never touches these, but Grok and the
// final coded entry carry them through.
export const SECTION_SCHEMAS: Record<SectionKind, SectionSchema> = {
  problems: { kind: "problems", system: SECTION_SYSTEM.problems, fields: [] },
  medications: { kind: "medications", system: SECTION_SYSTEM.medications, fields: ["dose", "reason"] },
  allergies: { kind: "allergies", system: SECTION_SYSTEM.allergies, fields: ["reaction"] },
  vitals: { kind: "vitals", system: SECTION_SYSTEM.vitals, fields: ["value", "unit"] },
};

function schema(kind: SectionKind): SectionSchema {
  return SECTION_SCHEMAS[kind];
}

// "Blood pressure 142/90" / "A1c 7.1%" -> { term, value, unit }. Best-effort and
// conservative: if we can't confidently split a value off, the whole line becomes
// the term and downstream stages handle it. We never invent values.
function parseVital(line: string): { term: string; value?: string; unit?: string } {
  // ratio form, e.g. "142/90"
  const ratio = line.match(/(.+?)\s+(\d{2,3}\/\d{2,3})\s*([a-z%]*)\s*$/i);
  if (ratio) return { term: ratio[1].trim(), value: ratio[2], unit: ratio[3] || undefined };
  // number + optional unit, e.g. "A1c 7.1%", "Heart rate 78 bpm"
  const num = line.match(/(.+?)\s+(\d+(?:\.\d+)?)\s*([a-z%]+)?\s*$/i);
  if (num) return { term: num[1].trim(), value: num[2], unit: num[3] || undefined };
  return { term: line.trim() };
}

// "Penicillin (rash)" -> { substance: "Penicillin", reaction: "rash" }
function parseAllergy(line: string): { term: string; reaction?: string } {
  const m = line.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { term: m[1].trim(), reaction: m[2].trim() };
  return { term: line.trim() };
}

let counter = 0;
const lineNo = () => ++counter;

// Build a RawItem with provenance back to the encounter + a synthetic line index.
function item(
  section: SectionKind,
  text: string,
  encounterId: string,
  fields?: Record<string, string>,
): RawItem {
  return {
    section,
    system: schema(section).system,
    text: text.trim(),
    fields,
    source: { encounterId, line: lineNo() },
  };
}

// Chunk the structured Encounter the app already produces. This is the primary
// path: the add_visit tool / seed data give us typed arrays, so chunking is mostly
// re-keying into RawItems while parsing vitals out of the free-text `notes`.
export function chunkEncounter(e: Encounter): ChunkedRecord {
  counter = 0;
  const problems: RawItem[] = (e.addProblems ?? []).map((p) => item("problems", p.name, e.id));

  const medications: RawItem[] = (e.addMedications ?? []).map((m) =>
    item("medications", m.name, e.id, { dose: m.dose, reason: m.reason }),
  );

  const allergies: RawItem[] = (e.addAllergies ?? []).map((a) =>
    item("allergies", a.substance, e.id, a.reaction ? { reaction: a.reaction } : undefined),
  );

  // Vitals are not a first-class field on Encounter — they live in `notes` as free
  // text. We extract only lines that parse into a value, leaving prose notes alone.
  const vitals: RawItem[] = [];
  for (const note of e.notes ?? []) {
    const parsed = parseVital(note);
    if (parsed.value) {
      const fields: Record<string, string> = { value: parsed.value };
      if (parsed.unit) fields.unit = parsed.unit;
      vitals.push(item("vitals", parsed.term, e.id, fields));
    }
  }

  return {
    encounterId: e.id,
    sections: [
      { schema: schema("problems"), items: problems },
      { schema: schema("medications"), items: medications },
      { schema: schema("allergies"), items: allergies },
      { schema: schema("vitals"), items: vitals },
    ].filter((s) => s.items.length > 0),
  };
}

// Chunk the section markdown the repo writes (e.g. the committed medications.md /
// problems.md / allergies.md bodies). Each is a "# Title\n\n- item\n- item" block;
// we read the bullet lines. Used when re-validating committed files directly.
export function chunkMarkdown(
  encounterId: string,
  files: Partial<Record<SectionKind, string>>,
): ChunkedRecord {
  counter = 0;
  const sections: ChunkedRecord["sections"] = [];

  const bullets = (md: string) =>
    md
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- ") && l !== "- _none recorded_")
      .map((l) => l.slice(2).trim());

  if (files.problems) {
    const items = bullets(files.problems).map((b) => item("problems", b, encounterId));
    if (items.length) sections.push({ schema: schema("problems"), items });
  }

  if (files.medications) {
    // lines look like "lisinopril 10 mg — for high blood pressure"
    const items = bullets(files.medications).map((b) => {
      const m = b.match(/^(.*?)\s+(\d+(?:\.\d+)?\s*[a-z]+)\s*[—-]\s*for\s+(.*)$/i);
      if (m) return item("medications", m[1].trim(), encounterId, { dose: m[2].trim(), reason: m[3].trim() });
      return item("medications", b, encounterId);
    });
    if (items.length) sections.push({ schema: schema("medications"), items });
  }

  if (files.allergies) {
    const items = bullets(files.allergies).map((b) => {
      const { term, reaction } = parseAllergy(b);
      return item("allergies", term, encounterId, reaction ? { reaction } : undefined);
    });
    if (items.length) sections.push({ schema: schema("allergies"), items });
  }

  return { encounterId, sections };
}
