// POST /api/auth/login/options
// body: { username }
// Returns WebAuthn authentication options for the user's registered credentials.
import { ensureSeededMetadata, getUserByUsername } from "@/lib/hub/store";
import { buildAuthenticationOptions } from "@/lib/auth/webauthn";

export const runtime = "nodejs";

export async function POST(req: Request) {
  ensureSeededMetadata();
  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username) return Response.json({ error: "username required" }, { status: 400 });

  const user = getUserByUsername(username);
  if (!user) return Response.json({ error: "unknown user" }, { status: 404 });

  const options = await buildAuthenticationOptions(user);
  return Response.json(options);
}
