import { addEncounter, ensureProvider, allProviders, getVisit, getAlerts, commitEncounter } from "@/lib/hx";
import type { Encounter, Medication } from "@/lib/hx";
import { validateRecord } from "@/lib/validation";
import { formatWithGrok } from "@/lib/hx/grok";

export const runtime = "nodejs";

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// Add a visit (used by the voice agent's add_visit tool, or any client).
export async function POST(req: Request) {
  let body: {
    title?: string;
    place?: string;
    providerName?: string;
    providerRole?: string;
    org?: string;
    date?: string;
    summary?: string;
    notes?: string[];
    medications?: Medication[];
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.title) return Response.json({ error: "title required" }, { status: 400 });

  const providerId = ensureProvider({
    name: body.providerName || "Reported by Maria",
    role: body.providerRole,
    org: body.org,
  });
  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "2026-06-13";
  const id = `${date}-${slug(body.title)}`;

  const enc: Encounter = {
    id,
    date,
    providerId,
    title: body.title,
    place: body.place || "Reported by phone",
    summary: body.summary || "",
    notes: Array.isArray(body.notes) ? body.notes : undefined,
    addMedications: Array.isArray(body.medications) ? body.medications : undefined,
  };

  // VALIDATION GATE: code every item, then let the deterministic verifier decide
  // what may persist. Only verified entries are committed to the record.
  let validation: { accepted: number; flagged: { term: string; reason: string; note?: string }[] } = {
    accepted: 0,
    flagged: [],
  };
  try {
    const { results } = await validateRecord(enc, formatWithGrok);
    const allNoCode = results.length > 0 && results.every((r) => r.reason === "no_code");
    function keep<T>(section: string, arr: T[] | undefined): T[] | undefined {
      if (!arr) return arr;
      const flags = results.filter((r) => r.section === section);
      return arr.filter((_, i) => (flags[i] ? flags[i].accepted : true));
    }
    if (!allNoCode) {
      // don't wipe a visit if the coder is entirely unavailable
      enc.addProblems = keep("problems", enc.addProblems);
      enc.addMedications = keep("medications", enc.addMedications);
      enc.addAllergies = keep("allergies", enc.addAllergies);
    }
    validation = {
      accepted: results.filter((r) => r.accepted).length,
      flagged: results
        .filter((r) => !r.accepted)
        .map((r) => ({ term: r.term, reason: r.reason, note: r.note })),
    };
  } catch {
    // coder unavailable: commit as-is rather than dropping data
  }

  addEncounter(enc);
  try {
    await commitEncounter(enc, allProviders()[providerId]);
  } catch {
    // commit is best-effort; the in-memory record still updates
  }

  return Response.json({ ok: true, visit: getVisit(id), alerts: getAlerts(), validation });
}
