// Shared client-side types + tiny fetch helpers for the Hub UI. These mirror the
// JSON shapes returned by the Hub APIs (see web/app/api/**). Pure UI glue — the
// real data model lives in @/lib/hub/model. SYNTHETIC data only.

export type Role = "patient" | "provider";
export type AccessLevel = "read" | "write";

// What GET /api/auth/me returns under `user`.
export type MeUser = {
  id: string;
  role: Role;
  displayName: string;
  username: string;
  providerRole?: string;
  org?: string;
};

// One entry from GET /api/repos.
export type RepoCard = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  access: AccessLevel;
  visitCount: number;
};

export type Repo = {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  createdAt: string;
};

// A commit as surfaced by getLog() (see @/lib/hub/repos).
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

// A cross-repo safety alert (see @/lib/hx/conflicts -> @/lib/hx/model Alert).
export type Alert = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  summary: string;
  explanation: string;
  whatToDo: string[];
  script?: string;
  involved: { name: string; provider: string; date: string }[];
};

// A grant row as returned by GET /api/repos/[id]/grant (with grantee info).
export type GrantRow = {
  id: string;
  repoId: string;
  granteeId: string;
  access: AccessLevel;
  grantedBy: string;
  createdAt: string;
  revokedAt?: string | null;
  granteeUsername?: string;
  granteeName?: string;
  granteeOrg?: string;
  granteeRole?: string;
};

// A share link as returned by GET/POST /api/repos/[id]/share.
export type ShareTokenRow = {
  token: string;
  repoId: string;
  access: AccessLevel;
  createdBy: string;
  label?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

// One merge conflict (see @/lib/hub/model MergeConflict).
export type MergeConflict = {
  repoId: string;
  filepath: string;
  base?: string;
  ours: string;
  theirs: string;
  oursLabel: string;
  theirsLabel: string;
};

// ---- fetch helpers --------------------------------------------------------

// JSON fetch that always sends cookies and throws a readable error on non-2xx.
export async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers || {}) } : init?.headers,
    ...init,
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---- formatting -----------------------------------------------------------

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Severity -> tailwind classes for the safety panel.
export const severityStyles: Record<Alert["severity"], { ring: string; bg: string; text: string; chip: string; label: string }> = {
  high: { ring: "border-red-300", bg: "bg-red-50", text: "text-red-900", chip: "bg-red-600 text-white", label: "Urgent" },
  medium: { ring: "border-amber-300", bg: "bg-amber-50", text: "text-amber-900", chip: "bg-amber-500 text-white", label: "Important" },
  low: { ring: "border-sky-300", bg: "bg-sky-50", text: "text-sky-900", chip: "bg-sky-500 text-white", label: "Heads up" },
};
