import { CodeEntry, CodeSystem, SectionKind } from "./model";
import rawCodes from "./codes.json";

// Tiny SYNTHETIC subsets of real public code systems — just enough to exercise
// the pipeline honestly against the demo patient (Maria Reyes). These mirror the
// shape of the real catalogs (ICD-10-CM, RxNorm, LOINC, UNII), so swapping in the
// full public files later is a data change, not a code change.
//
// Codes are PUBLIC identifiers (no PHI). Descriptions are the canonical labels;
// aliases are the messy ways a provider might actually phrase the same thing.

export const ICD10: CodeEntry[] = [
  { system: "ICD10", code: "I10", description: "Essential (primary) hypertension", aliases: ["high blood pressure", "hypertension", "htn", "elevated blood pressure"] },
  { system: "ICD10", code: "E11.9", description: "Type 2 diabetes mellitus without complications", aliases: ["type 2 diabetes", "diabetes type 2", "t2dm", "adult onset diabetes"] },
  { system: "ICD10", code: "F32.9", description: "Major depressive disorder, single episode, unspecified", aliases: ["depression", "low mood", "depressive episode", "major depression", "feeling down", "feeling really down", "feeling low", "down lately", "sad", "feeling sad"] },
  { system: "ICD10", code: "R07.9", description: "Chest pain, unspecified", aliases: ["chest pain", "chest discomfort"] },
  { system: "ICD10", code: "M79.1", description: "Myalgia", aliases: ["muscular pain", "muscle pain", "musculoskeletal pain", "muscular chest pain"] },
];

export const RXNORM: CodeEntry[] = [
  { system: "RXNORM", code: "29046", description: "lisinopril", aliases: ["prinivil", "zestril"] },
  { system: "RXNORM", code: "6809", description: "metformin", aliases: ["glucophage"] },
  { system: "RXNORM", code: "36437", description: "sertraline", aliases: ["zoloft"] },
  { system: "RXNORM", code: "10689", description: "tramadol", aliases: ["ultram"] },
  { system: "RXNORM", code: "4493", description: "fluoxetine", aliases: ["prozac"] },
];

export const LOINC: CodeEntry[] = [
  { system: "LOINC", code: "8480-6", description: "Systolic blood pressure", aliases: ["systolic bp", "sbp"] },
  { system: "LOINC", code: "8462-4", description: "Diastolic blood pressure", aliases: ["diastolic bp", "dbp"] },
  { system: "LOINC", code: "4548-4", description: "Hemoglobin A1c/Hemoglobin.total in Blood", aliases: ["a1c", "hba1c", "hemoglobin a1c", "glycated hemoglobin"] },
  { system: "LOINC", code: "8867-4", description: "Heart rate", aliases: ["pulse", "hr"] },
];

export const UNII: CodeEntry[] = [
  { system: "UNII", code: "Q42T66VG0C", description: "Penicillin", aliases: ["penicillin g", "pcn"] },
  { system: "UNII", code: "8R78F6L9VO", description: "Sulfamethoxazole", aliases: ["sulfa", "sulfonamide"] },
  { system: "UNII", code: "362O9ITL9D", description: "Acetaminophen", aliases: ["paracetamol", "tylenol"] },
];

// Map each section to its code system + its slice of the catalog. The verifier
// uses this to refuse codes from the wrong system (e.g. an RxNorm code claimed
// for a problem).
export const SECTION_SYSTEM: Record<SectionKind, CodeSystem> = {
  problems: "ICD10",
  medications: "RXNORM",
  vitals: "LOINC",
  allergies: "UNII",
};

// Expand the curated demo sets with the broader public code dump (codes.json) so
// common real drugs/conditions (e.g. atorvastatin) get coded instead of falling to
// manual review — while genuine unknowns / hallucinated codes are still refused.
const SYS_ALIAS: Record<string, CodeSystem> = {
  "ICD-10-CM": "ICD10",
  RxNorm: "RXNORM",
  ICD10: "ICD10",
  RXNORM: "RXNORM",
};
type RawCode = { code: string; description: string; system: string; aliases?: string[] };
function withExtras(base: CodeEntry[], system: CodeSystem): CodeEntry[] {
  const have = new Set(base.map((c) => c.code.toUpperCase()));
  const extra = (rawCodes as RawCode[])
    .filter((c) => SYS_ALIAS[c.system] === system && !have.has(c.code.toUpperCase()))
    .map((c): CodeEntry => ({ system, code: c.code, description: c.description, aliases: c.aliases ?? [] }));
  return [...base, ...extra];
}

const BY_SYSTEM: Record<CodeSystem, CodeEntry[]> = {
  ICD10: withExtras(ICD10, "ICD10"),
  RXNORM: withExtras(RXNORM, "RXNORM"),
  LOINC,
  UNII,
};

export function codeSet(system: CodeSystem): CodeEntry[] {
  return BY_SYSTEM[system] ?? [];
}

// O(1)-ish exact code lookup within a system. Used by the verifier's first gate.
export function findCode(system: CodeSystem, code: string): CodeEntry | undefined {
  if (!code) return undefined;
  const norm = code.trim().toUpperCase();
  return codeSet(system).find((c) => c.code.toUpperCase() === norm);
}
