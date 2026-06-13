import { Encounter, Provider } from "./model";

// SYNTHETIC demo patient: Maria Reyes, 58. No real PHI.
export const providers: Record<string, Provider> = {
  chen: {
    id: "chen",
    name: "Dr. Chen",
    role: "Primary Care",
    org: "Eastside Family Medicine",
    email: "dr.chen@eastsidefm.example",
  },
  okafor: {
    id: "okafor",
    name: "Dr. Okafor",
    role: "Psychiatry",
    org: "Bayview Behavioral Health",
    email: "dr.okafor@bayview.example",
  },
  er: {
    id: "er",
    name: "Mercy General ER",
    role: "Emergency",
    org: "Mercy General Hospital",
    email: "records@mercygeneral.example",
  },
};

// Chronological (oldest first). Each entry becomes a commit by its provider.
export const encounters: Encounter[] = [
  {
    id: "2026-01-15-annual-physical",
    date: "2026-01-15",
    providerId: "chen",
    title: "Annual physical",
    place: "Eastside Family Medicine",
    summary:
      "Routine yearly check-up. Blood pressure was a little high and blood sugar was elevated, so we started two daily medicines and talked about diet.",
    notes: ["Blood pressure 142/90", "A1c 7.1%", "Walk 30 min/day"],
    addProblems: [{ name: "High blood pressure (hypertension)" }, { name: "Type 2 diabetes" }],
    addMedications: [
      { name: "lisinopril", dose: "10 mg", reason: "high blood pressure" },
      { name: "metformin", dose: "500 mg", reason: "diabetes" },
    ],
    addAllergies: [{ substance: "Penicillin", reaction: "rash" }],
  },
  {
    id: "2026-03-03-psychiatry-follow-up",
    date: "2026-03-03",
    providerId: "okafor",
    title: "Psychiatry follow-up",
    place: "Bayview Behavioral Health",
    summary:
      "Follow-up for low mood and low energy over the past few months. Started an antidepressant and will check back in six weeks.",
    notes: ["Low mood ~3 months", "Started sertraline", "Recheck in 6 weeks"],
    addMedications: [{ name: "sertraline", dose: "100 mg", reason: "depression" }],
  },
  {
    id: "2026-06-11-er-chest-pain",
    date: "2026-06-11",
    providerId: "er",
    title: "ER visit — chest pain",
    place: "Mercy General ER",
    summary:
      "Came to the ER with chest pain. Heart tests came back normal and the pain was muscular. Sent home with a pain medicine.",
    notes: ["EKG normal", "Troponin normal", "Likely muscular chest pain", "Prescribed tramadol for pain"],
    addMedications: [{ name: "tramadol", dose: "50 mg", reason: "pain" }],
  },
];
