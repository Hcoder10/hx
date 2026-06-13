import { addEncounter, ensureProvider, allProviders, getVisit, getAlerts, commitEncounter } from "@/lib/hx";
import type { Encounter, Medication } from "@/lib/hx";

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

  addEncounter(enc);
  try {
    await commitEncounter(enc, allProviders()[providerId]);
  } catch {
    // commit is best-effort; the in-memory record still updates
  }

  return Response.json({ ok: true, visit: getVisit(id), alerts: getAlerts() });
}
