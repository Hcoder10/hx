// Authorization over the Hub store. Pure-ish helpers (read the store, no I/O of
// their own) used by every Hub API route to decide who may read/commit a repo.
//
// Rules:
//  - A patient who OWNS a repo has full (read + write) access to it.
//  - A provider has access to a repo iff there is an active grant for them whose
//    access level is >= the requested level. write implies read.
//  - Anonymous share links are resolved separately (resolveShareToken).

import { AccessLevel, Grant, Repo } from "./model";
import {
  getRepo,
  getToken,
  getUser,
  grantsForGrantee,
  grantsForRepo,
  listRepos,
} from "./store";

// write is the higher privilege; read is satisfied by either grant level.
function satisfies(have: AccessLevel, need: AccessLevel): boolean {
  if (need === "read") return have === "read" || have === "write";
  return have === "write";
}

// Does `userId` have at least `level` access to `repoId`?
export function canAccess(userId: string, repoId: string, level: AccessLevel): boolean {
  const repo = getRepo(repoId);
  if (!repo) return false;
  // Owner (patient) always has full read+write access to their own repo.
  if (repo.ownerId === userId) return true;
  // Otherwise require an active grant of sufficient level.
  const grant = grantsForRepo(repoId).find((g) => g.granteeId === userId);
  if (!grant) return false;
  return satisfies(grant.access, level);
}

export type AccessibleRepo = {
  repo: Repo;
  access: AccessLevel; // the caller's effective access to this repo
};

// All repos the user can see. Patients see the repos they own (full write);
// providers see the repos they hold an active grant on (at the granted level).
export function listAccessibleRepos(userId: string): AccessibleRepo[] {
  const user = getUser(userId);
  if (!user) return [];

  if (user.role === "patient") {
    return listRepos()
      .filter((r) => r.ownerId === userId)
      .map((repo) => ({ repo, access: "write" as AccessLevel }));
  }

  // provider: one entry per repo they have an active grant on (highest level wins)
  const byRepo = new Map<string, AccessLevel>();
  for (const g of grantsForGrantee(userId)) {
    const current = byRepo.get(g.repoId);
    if (!current || (g.access === "write" && current === "read")) {
      byRepo.set(g.repoId, g.access);
    }
  }
  const out: AccessibleRepo[] = [];
  for (const [repoId, access] of byRepo) {
    const repo = getRepo(repoId);
    if (repo) out.push({ repo, access });
  }
  return out;
}

// Resolve an anonymous share link. Valid iff the token exists, is not revoked,
// and is not expired. Returns the repo + the access level the link grants.
export function resolveShareToken(token: string): { repo: Repo; access: AccessLevel } | null {
  const t = getToken(token);
  if (!t) return null;
  if (t.revokedAt) return null;
  if (t.expiresAt && Date.parse(t.expiresAt) <= Date.now()) return null;
  const repo = getRepo(t.repoId);
  if (!repo) return null;
  return { repo, access: t.access };
}

export type { Grant };
