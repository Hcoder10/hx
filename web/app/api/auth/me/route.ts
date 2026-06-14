// GET /api/auth/me — returns the current session user, or 401.
import { ensureSeededMetadata, getUser } from "@/lib/hub/store";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "not authenticated" }, { status: 401 });

  const user = getUser(session.userId);
  if (!user) return Response.json({ error: "not authenticated" }, { status: 401 });

  return Response.json({
    user: {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      username: user.username,
      providerRole: user.providerRole,
      org: user.org,
    },
  });
}
