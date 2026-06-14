import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo } from "@/lib/hub/store";
import { ensureRepoBuilt, getLog } from "@/lib/hub/repos";

export const runtime = "nodejs";

// GET /api/repos/[id] -> { repo, log } when the caller has read access.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const repo = getRepo(id);
  if (!repo) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "read")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let log: Awaited<ReturnType<typeof getLog>> = [];
  try {
    await ensureRepoBuilt(id);
    log = await getLog(id);
  } catch {
    // log is best-effort
  }

  return Response.json({ repo, log });
}
