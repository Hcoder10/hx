import fs from "fs";
import path from "path";
import os from "os";
import { Grant, Repo, ShareToken, StoredCredential, User } from "./model";
import { SEED_GRANTS, SEED_REPOS, SEED_USERS } from "./seed";

// PERSISTENT Hub metadata store. Entities live as JSON files under HX_DATA_DIR
// (a mounted volume in prod, the OS temp dir locally). The actual visit content
// lives in the per-repo git repos under <HX_DATA_DIR>/repos/<id> (see hub/repos).
//
// Deliberately simple + synchronous: one JSON file per entity, an in-memory cache,
// write-through on mutation. Correct for a single-instance Hub (Railway). No PHI.

export const DATA_DIR = process.env.HX_DATA_DIR || path.join(os.tmpdir(), "hx-hub");
const META_DIR = path.join(DATA_DIR, "meta");
export const REPOS_ROOT = path.join(DATA_DIR, "repos");

type Entity = "users" | "credentials" | "repos" | "grants" | "tokens" | "challenges";
const cache: Partial<Record<Entity, unknown[]>> = {};

function fileFor(e: Entity) {
  return path.join(META_DIR, `${e}.json`);
}

function ensureDirs() {
  fs.mkdirSync(META_DIR, { recursive: true });
  fs.mkdirSync(REPOS_ROOT, { recursive: true });
}

function read<T>(e: Entity): T[] {
  if (cache[e]) return cache[e] as T[];
  ensureDirs();
  const f = fileFor(e);
  let arr: T[] = [];
  try {
    if (fs.existsSync(f)) arr = JSON.parse(fs.readFileSync(f, "utf8")) as T[];
  } catch {
    arr = [];
  }
  cache[e] = arr as unknown[];
  return arr;
}

function write<T>(e: Entity, arr: T[]) {
  ensureDirs();
  cache[e] = arr as unknown[];
  const tmp = fileFor(e) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), "utf8");
  fs.renameSync(tmp, fileFor(e));
}

// ---- Users ---------------------------------------------------------------
export function listUsers(): User[] {
  return read<User>("users");
}
export function getUser(id: string): User | undefined {
  return listUsers().find((u) => u.id === id);
}
export function getUserByUsername(username: string): User | undefined {
  const u = username.trim().toLowerCase();
  return listUsers().find((x) => x.username.toLowerCase() === u);
}
export function createUser(input: Omit<User, "id" | "createdAt"> & { id?: string }): User {
  const users = listUsers();
  const id = input.id || `u-${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;
  const user: User = { ...input, id, createdAt: new Date().toISOString() };
  users.push(user);
  write("users", users);
  return user;
}

// ---- WebAuthn credentials ------------------------------------------------
export function getCredentialsByUser(userId: string): StoredCredential[] {
  return read<StoredCredential>("credentials").filter((c) => c.userId === userId);
}
export function getCredentialById(id: string): StoredCredential | undefined {
  return read<StoredCredential>("credentials").find((c) => c.id === id);
}
export function addCredential(cred: StoredCredential) {
  const all = read<StoredCredential>("credentials");
  all.push(cred);
  write("credentials", all);
}
export function updateCredentialCounter(id: string, counter: number) {
  const all = read<StoredCredential>("credentials");
  const c = all.find((x) => x.id === id);
  if (c) {
    c.counter = counter;
    write("credentials", all);
  }
}

// ---- Repos ---------------------------------------------------------------
export function listRepos(): Repo[] {
  return read<Repo>("repos");
}
export function listReposByOwner(ownerId: string): Repo[] {
  return listRepos().filter((r) => r.ownerId === ownerId);
}
export function getRepo(id: string): Repo | undefined {
  return listRepos().find((r) => r.id === id);
}
export function createRepo(input: Omit<Repo, "id" | "createdAt"> & { id?: string }): Repo {
  const repos = listRepos();
  const id = input.id || `r-${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`;
  const repo: Repo = { ...input, id, createdAt: new Date().toISOString() };
  repos.push(repo);
  write("repos", repos);
  return repo;
}

// ---- Grants --------------------------------------------------------------
export function listGrants(): Grant[] {
  return read<Grant>("grants");
}
export function grantsForRepo(repoId: string): Grant[] {
  return listGrants().filter((g) => g.repoId === repoId && !g.revokedAt);
}
export function grantsForGrantee(granteeId: string): Grant[] {
  return listGrants().filter((g) => g.granteeId === granteeId && !g.revokedAt);
}
export function addGrant(input: Omit<Grant, "id" | "createdAt">): Grant {
  const grants = listGrants();
  // de-dupe: if an active grant for (repo,grantee) exists, upgrade its access
  const existing = grants.find((g) => g.repoId === input.repoId && g.granteeId === input.granteeId && !g.revokedAt);
  if (existing) {
    existing.access = input.access;
    write("grants", grants);
    return existing;
  }
  const grant: Grant = { ...input, id: `g-${Date.now().toString(36)}-${Math.floor(performance.now()).toString(36)}`, createdAt: new Date().toISOString() };
  grants.push(grant);
  write("grants", grants);
  return grant;
}
export function revokeGrant(id: string) {
  const grants = listGrants();
  const g = grants.find((x) => x.id === id);
  if (g) {
    g.revokedAt = new Date().toISOString();
    write("grants", grants);
  }
}

// ---- Share tokens --------------------------------------------------------
export function listTokens(): ShareToken[] {
  return read<ShareToken>("tokens");
}
export function getToken(token: string): ShareToken | undefined {
  return listTokens().find((t) => t.token === token);
}
export function tokensForRepo(repoId: string): ShareToken[] {
  return listTokens().filter((t) => t.repoId === repoId);
}
export function addToken(input: Omit<ShareToken, "token" | "createdAt"> & { token: string }): ShareToken {
  const tokens = listTokens();
  const t: ShareToken = { ...input, createdAt: new Date().toISOString() };
  tokens.push(t);
  write("tokens", tokens);
  return t;
}
export function revokeToken(token: string) {
  const tokens = listTokens();
  const t = tokens.find((x) => x.token === token);
  if (t) {
    t.revokedAt = new Date().toISOString();
    write("tokens", tokens);
  }
}

// ---- WebAuthn challenges (transient) -------------------------------------
type Challenge = { key: string; challenge: string; at: number };
export function setChallenge(key: string, challenge: string) {
  const all = read<Challenge>("challenges").filter((c) => c.key !== key && Date.now() - c.at < 5 * 60_000);
  all.push({ key, challenge, at: Date.now() });
  write("challenges", all);
}
export function getChallenge(key: string): string | undefined {
  return read<Challenge>("challenges").find((c) => c.key === key)?.challenge;
}
export function clearChallenge(key: string) {
  write("challenges", read<Challenge>("challenges").filter((c) => c.key !== key));
}

// ---- Seed (metadata only; hub/repos builds the git repos from SEED_VISITS) ----
let seeded = false;
export function ensureSeededMetadata() {
  if (seeded) return;
  ensureDirs();
  if (listUsers().length === 0) {
    write("users", [...SEED_USERS]);
    write("repos", [...SEED_REPOS]);
    write("grants", [...SEED_GRANTS]);
  }
  seeded = true;
}
