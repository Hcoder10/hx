// HTTP client for the hx Hub. Thin wrapper over global fetch that:
//   - resolves the base URL from config/env
//   - attaches the persisted session cookie on every call
//   - captures the Set-Cookie from /api/auth/dev-login and saves it
//   - turns non-2xx responses into friendly Errors carrying { status, body }
//
// All methods return parsed JSON. Network failures (Hub unreachable) raise an
// Error with .network = true so the CLI can print a clean message instead of a
// stack trace.

import {
  getHubUrl,
  readSessionCookie,
  writeSessionCookie,
  clearSession,
} from "./config.mjs";

export class HxError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "HxError";
    Object.assign(this, extra);
  }
}

// Core request. `path` is like "/api/repos". Options: { method, body, auth }.
// When auth !== false the saved cookie is sent. Returns parsed JSON (or null).
async function request(path, { method = "GET", body, captureCookie = false } = {}) {
  const url = getHubUrl() + path;
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const cookie = readSessionCookie();
  if (cookie) headers["Cookie"] = cookie;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
  } catch (e) {
    throw new HxError(`could not reach the Hub at ${getHubUrl()}`, {
      network: true,
      cause: e,
    });
  }

  // Persist the session cookie handed back by dev-login.
  if (captureCookie) {
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) writeSessionCookie(setCookie);
  }

  let parsed = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!res.ok) {
    const msg = (parsed && (parsed.error || parsed.detail)) || res.statusText || `HTTP ${res.status}`;
    throw new HxError(msg, { status: res.status, body: parsed });
  }
  return parsed;
}

export const api = {
  request,

  // ---- auth ----
  devLogin: (userId) =>
    request("/api/auth/dev-login", {
      method: "POST",
      body: { userId },
      captureCookie: true,
    }),
  me: () => request("/api/auth/me"),
  logout: async () => {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch {
      // even if the server call fails, drop the local session
    }
    clearSession();
  },

  // ---- data ----
  repos: () => request("/api/repos"),
  repo: (id) => request(`/api/repos/${encodeURIComponent(id)}`),
  files: (id) => request(`/api/repos/${encodeURIComponent(id)}/files`),
  visits: (id) => request(`/api/repos/${encodeURIComponent(id)}/visits`),
  addVisit: (id, visit) =>
    request(`/api/repos/${encodeURIComponent(id)}/visits`, { method: "POST", body: visit }),
  alerts: () => request("/api/hub/alerts"),

  // ---- sharing ----
  grant: (id, granteeUsername, access) =>
    request(`/api/repos/${encodeURIComponent(id)}/grant`, {
      method: "POST",
      body: { granteeUsername, access },
    }),
};
