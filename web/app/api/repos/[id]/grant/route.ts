import { getSession } from "@/lib/auth/session";
import {
  addGrant,
  createUser,
  ensureSeededMetadata,
  getRepo,
  getUser,
  getUserByUsername,
  grantsForRepo,
  revokeGrant,
} from "@/lib/hub/store";
import type { AccessLevel } from "@/lib/hub/model";

export const runtime = "nodejs";

// Only the repo owner (the patient) may manage grants on it.
function assertOwner(userId: string, repoId: string) {
  const repo = getRepo(repoId);
  if (!repo) return { error: "not found" as const, status: 404 };
  if (repo.ownerId !== userId) return { error: "forbidden" as const, status: 403 };
  return null;
}

// GET /api/repos/[id]/grant -> active grants on the repo (owner only), with grantee info.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const guard = assertOwner(session.userId, id);
  if (guard) return Response.json({ error: guard.error }, { status: guard.status });

  const grants = grantsForRepo(id).map((g) => {
    const u = getUser(g.granteeId);
    return {
      ...g,
      granteeUsername: u?.username,
      granteeName: u?.displayName,
      granteeOrg: u?.org,
      granteeRole: u?.providerRole,
    };
  });
  return Response.json({ grants });
}

// POST /api/repos/[id]/grant {granteeUsername|granteeId, access}
// Grant a provider scoped access. If granteeUsername has no account yet, a
// provider user is created on the fly (synthetic demo behaviour).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const guard = assertOwner(session.userId, id);
  if (guard) return Response.json({ error: guard.error }, { status: guard.status });

  let body: { granteeUsername?: string; granteeId?: string; access?: AccessLevel };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const access: AccessLevel = body.access === "write" ? "write" : "read";

  let grantee = body.granteeId ? getUser(body.granteeId) : undefined;
  if (!grantee && body.granteeUsername) {
    const username = body.granteeUsername.trim();
    grantee = getUserByUsername(username);
    if (!grantee) {
      grantee = createUser({
        role: "provider",
        username,
        displayName: username,
        email: username.includes("@") ? username : `${username}@hx.local`,
      });
    }
  }
  if (!grantee) {
    return Response.json({ error: "granteeUsername or granteeId required" }, { status: 400 });
  }
  if (grantee.id === session.userId) {
    return Response.json({ error: "cannot grant access to yourself" }, { status: 400 });
  }

  const grant = addGrant({
    repoId: id,
    granteeId: grantee.id,
    access,
    grantedBy: session.userId,
  });

  return Response.json({ grant }, { status: 201 });
}

// DELETE /api/repos/[id]/grant {grantId} -> revoke a grant (owner only).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const guard = assertOwner(session.userId, id);
  if (guard) return Response.json({ error: guard.error }, { status: guard.status });

  let body: { grantId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.grantId) return Response.json({ error: "grantId required" }, { status: 400 });

  // Only allow revoking a grant that belongs to this repo.
  const belongs = grantsForRepo(id).some((g) => g.id === body.grantId);
  if (!belongs) return Response.json({ error: "grant not found on this repo" }, { status: 404 });

  revokeGrant(body.grantId);
  return Response.json({ ok: true });
}
