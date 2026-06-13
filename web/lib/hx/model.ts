// Core data model for Hx. Synthetic data only.

export type Provider = {
  id: string;
  name: string;
  role: string;
  org: string;
  email: string; // used as git commit author email
};

export type Medication = {
  name: string;
  dose: string;
  reason: string;
};

export type Problem = { name: string };
export type Allergy = { substance: string; reaction?: string };

// Each encounter becomes one git commit, authored by its provider.
export type Encounter = {
  id: string; // slug, e.g. "2026-06-11-er-chest-pain"
  date: string; // YYYY-MM-DD
  providerId: string;
  title: string;
  place: string;
  summary: string; // plain-language, patient-facing
  notes?: string[];
  addMedications?: Medication[];
  addProblems?: Problem[];
  addAllergies?: Allergy[];
};

export type MedWithProvenance = Medication & {
  providerName: string;
  providerRole: string;
  date: string;
};

export type Alert = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  summary: string;
  explanation: string;
  whatToDo: string[];
  script?: string;
  involved: { name: string; provider: string; date: string }[];
};
