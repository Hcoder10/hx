import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo } from "@/lib/hub/store";
import { allMedicationsForOwner, type MedWithProvenance } from "@/lib/hub/repos";
import { checkConflicts } from "@/lib/hx/conflicts";

export const runtime = "nodejs";

// POST /api/hub/check-interaction  { repoId, name, dose?, reason? }
// Pre-commit safety check used by the provider voice agent's `prescribe` tool:
// adds the PROPOSED medication to the patient's full cross-repo med list and runs
// the interaction engine WITHOUT committing anything. Returns any alerts that
// involve the proposed drug so the agent can read the warning aloud first.
export async function POST(req: Request) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: { repoId?: string; name?: string; dose?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { repoId, name } = body;
  if (!repoId || !name) return Response.json({ error: "repoId and name required" }, { status: 400 });

  const repo = getRepo(repoId);
  if (!repo) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, repoId, "write")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let existing: MedWithProvenance[] = [];
  try {
    existing = await allMedicationsForOwner(repo.ownerId);
  } catch {}

  const proposed: MedWithProvenance = {
    name,
    dose: body.dose || "",
    reason: body.reason || "",
    providerName: "(proposed now)",
    providerRole: "",
    date: "2026-06-13",
    repoId,
    repoName: repo.name,
  };

  const before = checkConflicts(existing);
  const after = checkConflicts([...existing, proposed]);

  // Warnings are alerts that appear only AFTER adding the proposed drug, or that
  // name the proposed drug among the involved medicines.
  const beforeIds = new Set(before.map((a) => a.id));
  const lname = name.toLowerCase();
  const warnings = after.filter(
    (a) => !beforeIds.has(a.id) || a.involved.some((i) => i.name.toLowerCase().includes(lname)),
  );

  return Response.json({ safe: warnings.length === 0, warnings });
}
