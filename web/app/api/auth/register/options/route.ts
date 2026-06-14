// POST /api/auth/register/options
// body: { username, displayName, role, org?, providerRole? }
// Resolves (or creates) the user, then returns WebAuthn registration options.
import { ensureSeededMetadata, getUserByUsername, createUser } from "@/lib/hub/store";
import { buildRegistrationOptions } from "@/lib/auth/webauthn";
import type { Role, User } from "@/lib/hub/model";

export const runtime = "nodejs";

export async function POST(req: Request) {
  ensureSeededMetadata();
  let body: {
    username?: string;
    displayName?: string;
    role?: string;
    org?: string;
    providerRole?: string;
    email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const username = body.username?.trim();
  if (!username) return Response.json({ error: "username required" }, { status: 400 });

  const role: Role = body.role === "provider" ? "provider" : "patient";
  const displayName = body.displayName?.trim() || username;

  let user: User | undefined = getUserByUsername(username);
  if (!user) {
    user = createUser({
      role,
      username,
      displayName,
      org: role === "provider" ? body.org : undefined,
      providerRole: role === "provider" ? body.providerRole : undefined,
      email: body.email || (role === "provider" ? username : undefined),
    });
  }

  const options = await buildRegistrationOptions(user);
  return Response.json(options);
}
