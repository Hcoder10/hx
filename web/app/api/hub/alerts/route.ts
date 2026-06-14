import { getSession } from "@/lib/auth/session";
import { ensureSeededMetadata, getUser } from "@/lib/hub/store";
import { allMedicationsForOwner } from "@/lib/hub/repos";
import { checkConflicts } from "@/lib/hx/conflicts";

export const runtime = "nodejs";

// GET /api/hub/alerts -> cross-repo safety alerts for the current PATIENT.
// Gathers every medication across ALL of the patient's repos (with provenance:
// who prescribed it, their role, the date, the dose) and runs the deterministic
// conflict scan. This is the whole point of the Hub: catching an interaction
// that no single provider's siloed record could see.
export async function GET(req: Request) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const user = getUser(session.userId);
  if (!user || user.role !== "patient") {
    return Response.json({ error: "only patients have cross-repo alerts" }, { status: 403 });
  }

  let meds: Awaited<ReturnType<typeof allMedicationsForOwner>> = [];
  try {
    meds = await allMedicationsForOwner(session.userId);
  } catch {
    // best-effort; no meds -> no alerts
  }

  const alerts = checkConflicts(meds);
  return Response.json({ alerts });
}
