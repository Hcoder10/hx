// Config + session persistence for the hx CLI.
//
// Base URL resolution order:
//   1. $HX_HUB_URL
//   2. ~/.hx/config.json  { "hubUrl": "..." }
//   3. DEFAULT_HUB_URL
//
// The session cookie returned by /api/auth/dev-login is persisted to
// ~/.hx/session (raw "name=value" cookie string) so subsequent commands are
// authed. ~/.hx is created with 0700 and the session file with 0600 (best-effort
// — Windows ignores the mode but the call is harmless).

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const DEFAULT_HUB_URL = "https://hx-web-production.up.railway.app";

const HX_DIR = path.join(os.homedir(), ".hx");
const CONFIG_PATH = path.join(HX_DIR, "config.json");
const SESSION_PATH = path.join(HX_DIR, "session");

function ensureDir() {
  try {
    fs.mkdirSync(HX_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // best-effort
  }
}

export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  ensureDir();
  const merged = { ...readConfig(), ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  return merged;
}

// Resolve the Hub base URL (no trailing slash).
export function getHubUrl() {
  const fromEnv = process.env.HX_HUB_URL && process.env.HX_HUB_URL.trim();
  const fromCfg = readConfig().hubUrl;
  const url = fromEnv || fromCfg || DEFAULT_HUB_URL;
  return url.replace(/\/+$/, "");
}

// The persisted session cookie ("hx_session=...") or null.
export function readSessionCookie() {
  try {
    const raw = fs.readFileSync(SESSION_PATH, "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

// Persist the cookie. Accepts a full Set-Cookie header value; we keep only the
// leading "name=value" pair (attributes like Path/HttpOnly are not sent back).
export function writeSessionCookie(setCookieValue) {
  ensureDir();
  const pair = String(setCookieValue).split(";")[0].trim();
  fs.writeFileSync(SESSION_PATH, pair + "\n", { mode: 0o600 });
  return pair;
}

export function clearSession() {
  try {
    fs.rmSync(SESSION_PATH);
  } catch {
    // already gone
  }
}

export const PATHS = { HX_DIR, CONFIG_PATH, SESSION_PATH };
