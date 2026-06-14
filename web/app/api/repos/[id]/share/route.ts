import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth/session";
import {
  addToken,
  ensureSeededMetadata,
  getRepo,
  revokeToken,
  tokensForRepo,
} from "@/lib/hub/store";
import type { AccessLevel } from "@/lib/hub/model";

export const runtime = "nodejs";

// A url-safe, unguessable share token.
function newToken(): string {
  return randomBytes(24).toString("base64url");
}

// Only the repo owner may manage its share links.
function assertOwner(userId: string, repoId: string) {
  const repo = getRepo(repoId);
  if (!repo) return { error: "not found" as const, status: 404 };
  if (repo.ownerId !== userId) return { error: "forbidden" as const, status: 403 };
  return null;
}

// GET /api/repos/[id]/share -> share links for the repo (owner only).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const guard = assertOwner(session.userId, id);
  if (guard) return Response.json({ error: guard.error }, { status: guard.status });

  return Response.json({ tokens: tokensForRepo(id) });
}

// POST /api/repos/[id]/share {access, label?, expiresAt?} -> create a share link.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const guard = assertOwner(session.userId, id);
  if (guard) return Response.json({ error: guard.error }, { status: guard.status });

  let body: { access?: AccessLevel; label?: string; expiresAt?: string };
  try {
    body = await req.json();
  } catch {
    // allow an empty body -> defaults to a read-only link
    body = {};
  }

  const access: AccessLevel = body.access === "write" ? "write" : "read";
  let expiresAt: string | null = null;
  if (body.expiresAt) {
    const ts = Date.parse(body.expiresAt);
    if (!Number.isNaN(ts)) expiresAt = new Date(ts).toISOString();
  }

  const token = addToken({
    token: newToken(),
    repoId: id,
    access,
    createdBy: session.userId,
    label: body.label?.trim() || undefined,
    expiresAt,
  });

  return Response.json({ token }, { status: 201 });
}

// DELETE /api/repos/[id]/share {token} -> revoke a share link (owner only).
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const guard = assertOwner(session.userId, id);
  if (guard) return Response.json({ error: guard.error }, { status: guard.status });

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.token) return Response.json({ error: "token required" }, { status: 400 });

  // Only revoke a token that belongs to this repo.
  const belongs = tokensForRepo(id).some((t) => t.token === body.token);
  if (!belongs) return Response.json({ error: "token not found on this repo" }, { status: 404 });

  revokeToken(body.token);
  return Response.json({ ok: true });
}
