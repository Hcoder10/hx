// POST /api/auth/logout — clears the session cookie.
import { jsonClearingSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  return jsonClearingSession({ ok: true });
}
