import { Grant, Repo, User, Visit } from "./model";

// SYNTHETIC seed for the Hub demo (Maria Reyes, 58). Maps the original single
// record into the multi-repo model: Maria (patient) owns three visit-thread repos,
// each authored by a different provider. The serotonin-syndrome interaction now
// spans TWO repos (Mental Health: sertraline + Emergency: tramadol), which is
// exactly why a unified, patient-owned Hub matters. No real PHI.

export const SEED_USERS: User[] = [
  { id: "maria", role: "patient", username: "maria@hx.demo", displayName: "Maria Reyes", createdAt: "2026-01-01T00:00:00Z" },
  { id: "chen", role: "provider", username: "dr.chen@eastsidefm.example", displayName: "Dr. Chen", providerRole: "Primary Care", org: "Eastside Family Medicine", email: "dr.chen@eastsidefm.example", createdAt: "2026-01-01T00:00:00Z" },
  { id: "okafor", role: "provider", username: "dr.okafor@bayview.example", displayName: "Dr. Okafor", providerRole: "Psychiatry", org: "Bayview Behavioral Health", email: "dr.okafor@bayview.example", createdAt: "2026-01-01T00:00:00Z" },
  { id: "er", role: "provider", username: "records@mercygeneral.example", displayName: "Mercy General ER", providerRole: "Emergency", org: "Mercy General Hospital", email: "records@mercygeneral.example", createdAt: "2026-01-01T00:00:00Z" },
];

export const SEED_REPOS: Repo[] = [
  { id: "primary-care", ownerId: "maria", name: "Primary Care", description: "Routine and preventive care with Dr. Chen.", createdAt: "2026-01-01T00:00:00Z" },
  { id: "mental-health", ownerId: "maria", name: "Mental Health", description: "Psychiatry care with Dr. Okafor.", createdAt: "2026-01-01T00:00:00Z" },
  { id: "emergency", ownerId: "maria", name: "Emergency & Acute", description: "Urgent and emergency visits.", createdAt: "2026-01-01T00:00:00Z" },
];

// Each provider has WRITE access only to their own thread — scoped access in action.
export const SEED_GRANTS: Grant[] = [
  { id: "g-chen", repoId: "primary-care", granteeId: "chen", access: "write", grantedBy: "maria", createdAt: "2026-01-01T00:00:00Z" },
  { id: "g-okafor", repoId: "mental-health", granteeId: "okafor", access: "write", grantedBy: "maria", createdAt: "2026-01-01T00:00:00Z" },
  { id: "g-er", repoId: "emergency", granteeId: "er", access: "write", grantedBy: "maria", createdAt: "2026-01-01T00:00:00Z" },
];

// Seed visits per repo (chronological). Each becomes one commit authored by authorId.
export const SEED_VISITS: Record<string, Visit[]> = {
  "primary-care": [
    {
      id: "2026-01-15-annual-physical",
      date: "2026-01-15",
      authorId: "chen",
      title: "Annual physical",
      place: "Eastside Family Medicine",
      summary: "Routine yearly check-up. Blood pressure was a little high and blood sugar was elevated, so we started two daily medicines and talked about diet.",
      notes: ["Blood pressure 142/90", "A1c 7.1%", "Walk 30 min/day"],
      addProblems: [{ name: "High blood pressure (hypertension)" }, { name: "Type 2 diabetes" }],
      addMedications: [
        { name: "lisinopril", dose: "10 mg", reason: "high blood pressure" },
        { name: "metformin", dose: "500 mg", reason: "diabetes" },
      ],
      addAllergies: [{ substance: "Penicillin", reaction: "rash" }],
    },
  ],
  "mental-health": [
    {
      id: "2026-03-03-psychiatry-follow-up",
      date: "2026-03-03",
      authorId: "okafor",
      title: "Psychiatry follow-up",
      place: "Bayview Behavioral Health",
      summary: "Follow-up for low mood and low energy over the past few months. Started an antidepressant and will check back in six weeks.",
      notes: ["Low mood ~3 months", "Started sertraline", "Recheck in 6 weeks"],
      addMedications: [{ name: "sertraline", dose: "100 mg", reason: "depression" }],
    },
  ],
  "emergency": [
    {
      id: "2026-06-11-er-chest-pain",
      date: "2026-06-11",
      authorId: "er",
      title: "ER visit — chest pain",
      place: "Mercy General ER",
      summary: "Came to the ER with chest pain. Heart tests came back normal and the pain was muscular. Sent home with a pain medicine.",
      notes: ["EKG normal", "Troponin normal", "Likely muscular chest pain", "Prescribed tramadol for pain"],
      addMedications: [{ name: "tramadol", dose: "50 mg", reason: "pain" }],
    },
  ],
};
