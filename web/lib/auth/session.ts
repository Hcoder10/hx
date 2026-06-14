// Signed-cookie sessions for the Hx Hub. The session principal is {userId, role}
// (see hub/model Session). The cookie value is `<base64url(payload)>.<hmac>`
// where the HMAC is HMAC-SHA256 over the payload using HX_SESSION_SECRET. This is
// a synthetic demo secret by default; set HX_SESSION_SECRET in real deploys.

import crypto from "crypto";
import { cookies } from "next/headers";
import type { Session } from "@/lib/hub/model";

export const SESSION_COOKIE = "hx_session";
const SESSION_SECRET = process.env.HX_SESSION_SECRET || "dev-hx-secret-change-me";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return b64url(crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest());
}

// Encode a session into a signed cookie value.
export function encodeSession(session: Session): string {
  const payload = b64url(Buffer.from(JSON.stringify(session), "utf8"));
  return `${payload}.${sign(payload)}`;
}

// Decode + verify a signed cookie value. Returns null if missing/invalid.
export function decodeSession(value: string | undefined | null): Session | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(payload);
  // constant-time compare
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(b64urlToBuf(payload).toString("utf8")) as Session;
    if (!obj || typeof obj.userId !== "string" || (obj.role !== "patient" && obj.role !== "provider")) {
      return null;
    }
    return { userId: obj.userId, role: obj.role };
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

// Parse + verify the session. Two call styles:
//   getSession(req)  -> Session | null            (route handler with a Request)
//   await getSession() -> Promise<Session | null> (uses Next's async cookies())
// Both are supported so callers can use whichever is convenient; `await` on the
// synchronous form is a harmless no-op.
export function getSession(req: Request): Session | null;
export function getSession(): Promise<Session | null>;
export function getSession(req?: Request): Session | null | Promise<Session | null> {
  if (req) return decodeSession(readCookie(req, SESSION_COOKIE));
  return cookies().then((c) => decodeSession(c.get(SESSION_COOKIE)?.value));
}

// Like getSession but the caller decides how to treat a null (unauthorized) result.
export function requireSession(req: Request): Session | null;
export function requireSession(): Promise<Session | null>;
export function requireSession(req?: Request): Session | null | Promise<Session | null> {
  return req ? getSession(req) : getSession();
}

const COOKIE_BASE = `Path=/; HttpOnly; SameSite=Lax`;
function secureFlag(): string {
  // Mark Secure when the configured origin is https (prod). Local http stays usable.
  const origin = process.env.HX_ORIGIN || "http://localhost:3000";
  return origin.startsWith("https://") ? "; Secure" : "";
}

// Build the Set-Cookie header value that establishes a session.
export function setSessionCookie(session: Session): string {
  return `${SESSION_COOKIE}=${encodeSession(session)}; ${COOKIE_BASE}; Max-Age=${MAX_AGE}${secureFlag()}`;
}

// Build the Set-Cookie header value that clears the session.
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; ${COOKIE_BASE}; Max-Age=0${secureFlag()}`;
}

// Convenience: a JSON Response that also sets/clears the session cookie.
export function jsonWithSession(body: unknown, session: Session, init?: ResponseInit): Response {
  const res = Response.json(body, init);
  res.headers.append("Set-Cookie", setSessionCookie(session));
  return res;
}

export function jsonClearingSession(body: unknown, init?: ResponseInit): Response {
  const res = Response.json(body, init);
  res.headers.append("Set-Cookie", clearSessionCookie());
  return res;
}
