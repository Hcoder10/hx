import { getSession } from "@/lib/auth/session";
import { listAccessibleRepos } from "@/lib/hub/access";
import { createRepo, ensureSeededMetadata, getUser } from "@/lib/hub/store";
import { ensureRepoBuilt, getLog } from "@/lib/hub/repos";

export const runtime = "nodejs";

// GET /api/repos -> repos accessible to the session user.
//   patient  -> repos they own (write access)
//   provider -> repos they hold an active grant on (granted access level)
// Each entry includes name, description, the caller's access level, and visitCount.
export async function GET(req: Request) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const accessible = listAccessibleRepos(session.userId);
  const repos = await Promise.all(
    accessible.map(async ({ repo, access }) => {
      let visitCount = 0;
      try {
        await ensureRepoBuilt(repo.id);
        visitCount = (await getLog(repo.id)).length;
      } catch {
        // repo build/log is best-effort; surface metadata even if git is unavailable
      }
      return {
        id: repo.id,
        name: repo.name,
        description: repo.description,
        ownerId: repo.ownerId,
        createdAt: repo.createdAt,
        access,
        visitCount,
      };
    })
  );

  return Response.json({ repos });
}

// POST /api/repos {name, description} -> create a new repo (patients only).
export async function POST(req: Request) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const user = getUser(session.userId);
  if (!user || user.role !== "patient") {
    return Response.json({ error: "only patients can create repos" }, { status: 403 });
  }

  let body: { name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = body?.name?.trim();
  if (!name) return Response.json({ error: "name required" }, { status: 400 });

  const repo = createRepo({
    ownerId: session.userId,
    name,
    description: body.description?.trim() || undefined,
  });

  try {
    await ensureRepoBuilt(repo.id);
  } catch {
    // git init is best-effort; metadata is created regardless
  }

  return Response.json({ repo }, { status: 201 });
}
