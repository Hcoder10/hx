// GET /api/repos/[id]/files — the cumulative section files for a repo at HEAD:
// medications.md, problems.md, allergies.md (and the care plan if it exists).
// Read access required. Used by the Hub repo page to show the current state of
// the record, not just the commit list. SYNTHETIC data only.

import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo } from "@/lib/hub/store";
import { ensureRepoBuilt, listVisitFiles, readFileAt } from "@/lib/hub/repos";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!getRepo(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "read")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let files = { medications: "", problems: "", allergies: "" };
  let plan: string | null = null;
  try {
    await ensureRepoBuilt(id);
    files = await listVisitFiles(id);
    plan = await readFileAt(id, "plan.md");
  } catch {
    // best-effort; return empties
  }

  return Response.json({ files, plan });
}
