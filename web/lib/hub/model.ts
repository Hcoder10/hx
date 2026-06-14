// Hx Hub data model. The Hub is the persistent backend: users (patients +
// providers), passkey credentials, per-patient repos (each a "thread of visits",
// each commit = one visit), and the access grants / share tokens that let a
// patient give a specific provider scoped read or commit access to one repo.
// SYNTHETIC data only.

export type Role = "patient" | "provider";
export type AccessLevel = "read" | "write";

export type User = {
  id: string;
  role: Role;
  username: string; // unique login handle (email or phone-like)
  displayName: string; // shown in UI
  org?: string; // provider organization
  providerRole?: string; // e.g. "Psychiatry", "Emergency"
  email?: string; // git commit author email
  createdAt: string; // ISO
};

// A registered WebAuthn passkey for a user.
export type StoredCredential = {
  id: string; // credentialID, base64url
  userId: string;
  publicKey: string; // COSE public key, base64url
  counter: number;
  transports?: string[];
  createdAt: string;
};

// A repo = one thread of visits owned by a patient. Stored as a REAL git repo on
// disk at <HX_DATA_DIR>/repos/<id>; commits are visits authored by providers.
export type Repo = {
  id: string;
  ownerId: string; // patient userId
  name: string; // e.g. "Mental Health", "Primary Care"
  description?: string;
  createdAt: string;
};

// Patient -> provider scoped access to one repo. revokedAt set => no longer valid.
export type Grant = {
  id: string;
  repoId: string;
  granteeId: string; // provider userId
  access: AccessLevel;
  grantedBy: string; // patient userId
  createdAt: string;
  revokedAt?: string | null;
};

// A revocable share link granting access to a repo without a provider account.
export type ShareToken = {
  token: string; // random url-safe id
  repoId: string;
  access: AccessLevel;
  createdBy: string; // patient userId
  label?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

// One visit's content (the payload committed into a repo). Mirrors the existing
// hx Encounter so the validation pipeline + conflict scan can be reused.
export type Visit = {
  id: string; // slug
  date: string; // YYYY-MM-DD
  authorId: string; // provider userId (git author)
  title: string;
  place: string;
  summary: string;
  notes?: string[];
  addMedications?: { name: string; dose: string; reason: string }[];
  addProblems?: { name: string }[];
  addAllergies?: { substance: string; reaction?: string }[];
};

// A commit as surfaced to the UI (a visit in a repo).
export type VisitCommit = {
  oid: string;
  shortOid: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: string;
  parents: string[];
  repoId: string;
};

// One side of a git merge conflict on a file (used by the merge-conflict flow).
export type MergeConflict = {
  repoId: string;
  filepath: string;
  base?: string;
  ours: string; // current branch content
  theirs: string; // incoming branch content
  oursLabel: string; // e.g. provider/date
  theirsLabel: string;
};

// The Hub session principal (decoded from the signed cookie).
export type Session = {
  userId: string;
  role: Role;
};
