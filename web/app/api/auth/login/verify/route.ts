// POST /api/auth/login/verify
// body: { username, response }
// Verifies the assertion, bumps the credential counter, and signs the user in.
import { ensureSeededMetadata, getUserByUsername } from "@/lib/hub/store";
import { verifyAuthentication } from "@/lib/auth/webauthn";
import { jsonWithSession } from "@/lib/auth/session";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  ensureSeededMetadata();
  let body: { username?: string; response?: AuthenticationResponseJSON };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username || !body.response) {
    return Response.json({ error: "username and response required" }, { status: 400 });
  }

  const user = getUserByUsername(username);
  if (!user) return Response.json({ error: "unknown user" }, { status: 404 });

  const result = await verifyAuthentication(user, body.response);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });

  const u = result.user;
  return jsonWithSession(
    { ok: true, user: { id: u.id, role: u.role, displayName: u.displayName } },
    { userId: u.id, role: u.role },
  );
}
