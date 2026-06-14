import { resolveShareToken } from "@/lib/hub/access";
import { ensureSeededMetadata, getUser } from "@/lib/hub/store";
import { ensureRepoBuilt, getLog } from "@/lib/hub/repos";

export const runtime = "nodejs";

// GET /api/shared/[token] -> read-only repo view via a share link. NO session
// required: the unguessable token IS the credential. Returns the repo, the
// granted access level, and the commit log (visits).
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  ensureSeededMetadata();
  const { token } = await ctx.params;

  const resolved = resolveShareToken(token);
  if (!resolved) {
    return Response.json({ error: "invalid or expired link" }, { status: 404 });
  }
  const { repo, access } = resolved;

  let log: Awaited<ReturnType<typeof getLog>> = [];
  try {
    await ensureRepoBuilt(repo.id);
    log = await getLog(repo.id);
  } catch {
    // best-effort
  }

  const owner = getUser(repo.ownerId);
  return Response.json({
    repo,
    access,
    owner: owner ? { displayName: owner.displayName } : undefined,
    log,
  });
}
