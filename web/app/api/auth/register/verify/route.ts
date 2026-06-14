// POST /api/auth/register/verify
// body: { username, response }
// Verifies the attestation, stores the credential, and signs the user in.
import { ensureSeededMetadata, getUserByUsername } from "@/lib/hub/store";
import { verifyAndStoreRegistration } from "@/lib/auth/webauthn";
import { jsonWithSession } from "@/lib/auth/session";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  ensureSeededMetadata();
  let body: { username?: string; response?: RegistrationResponseJSON };
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

  const result = await verifyAndStoreRegistration(user, body.response);
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });

  return jsonWithSession(
    { ok: true, user: { id: user.id, role: user.role, displayName: user.displayName } },
    { userId: user.id, role: user.role },
  );
}
