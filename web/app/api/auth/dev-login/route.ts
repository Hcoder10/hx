// POST /api/auth/dev-login
// body: { userId } OR { username }
// Deliberate demo convenience: signs in as a SEEDED user WITHOUT a passkey, so
// the multi-role Hub demo + automated tests work without a real authenticator.
import { ensureSeededMetadata, getUser, getUserByUsername } from "@/lib/hub/store";
import { jsonWithSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  ensureSeededMetadata();
  let body: { userId?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const user = body.userId
    ? getUser(body.userId)
    : body.username
      ? getUserByUsername(body.username)
      : undefined;

  if (!user) return Response.json({ error: "unknown user" }, { status: 404 });

  return jsonWithSession(
    {
      ok: true,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName,
        providerRole: user.providerRole,
        org: user.org,
      },
    },
    { userId: user.id, role: user.role },
  );
}
