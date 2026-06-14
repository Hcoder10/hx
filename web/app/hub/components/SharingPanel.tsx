"use client";

// Sharing controls for a thread — OWNER (patient) only. Two parts:
//   1. Provider grants: invite a provider by email, choose read / can-add-visits,
//      list active grants, revoke. (POST/GET/DELETE /api/repos/[id]/grant)
//   2. Share links: create a revocable read-only (or write) link that needs no
//      account, copy it, list + revoke. (POST/GET/DELETE /api/repos/[id]/share)

import { useCallback, useEffect, useState } from "react";
import { api, type AccessLevel, type GrantRow, type ShareTokenRow } from "../lib";
import { Button } from "./ui";
import { CopyButton } from "./CopyButton";

export function SharingPanel({ repoId }: { repoId: string }) {
  const [grants, setGrants] = useState<GrantRow[] | null>(null);
  const [tokens, setTokens] = useState<ShareTokenRow[] | null>(null);

  // grant form
  const [granteeUsername, setGranteeUsername] = useState("");
  const [grantAccess, setGrantAccess] = useState<AccessLevel>("read");
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  // share form
  const [linkLabel, setLinkLabel] = useState("");
  const [linkAccess] = useState<AccessLevel>("read");
  const [linkBusy, setLinkBusy] = useState(false);

  const loadGrants = useCallback(async () => {
    try {
      const { grants } = await api<{ grants: GrantRow[] }>(`/api/repos/${repoId}/grant`);
      setGrants(grants);
    } catch {
      setGrants([]);
    }
  }, [repoId]);

  const loadTokens = useCallback(async () => {
    try {
      const { tokens } = await api<{ tokens: ShareTokenRow[] }>(`/api/repos/${repoId}/share`);
      setTokens(tokens);
    } catch {
      setTokens([]);
    }
  }, [repoId]);

  useEffect(() => {
    loadGrants();
    loadTokens();
  }, [loadGrants, loadTokens]);

  async function addGrant() {
    const uname = granteeUsername.trim();
    if (!uname) return;
    setGrantBusy(true);
    setGrantError(null);
    try {
      await api(`/api/repos/${repoId}/grant`, {
        method: "POST",
        body: JSON.stringify({ granteeUsername: uname, access: grantAccess }),
      });
      setGranteeUsername("");
      setGrantAccess("read");
      await loadGrants();
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : "Could not share.");
    } finally {
      setGrantBusy(false);
    }
  }

  async function revokeGrant(grantId: string) {
    try {
      await api(`/api/repos/${repoId}/grant`, { method: "DELETE", body: JSON.stringify({ grantId }) });
      await loadGrants();
    } catch {
      /* ignore */
    }
  }

  async function createLink() {
    setLinkBusy(true);
    try {
      await api(`/api/repos/${repoId}/share`, {
        method: "POST",
        body: JSON.stringify({ access: linkAccess, label: linkLabel.trim() || undefined }),
      });
      setLinkLabel("");
      await loadTokens();
    } catch {
      /* ignore */
    } finally {
      setLinkBusy(false);
    }
  }

  async function revokeLink(token: string) {
    try {
      await api(`/api/repos/${repoId}/share`, { method: "DELETE", body: JSON.stringify({ token }) });
      await loadTokens();
    } catch {
      /* ignore */
    }
  }

  function linkUrl(token: string): string {
    if (typeof window === "undefined") return `/hub/shared/${token}`;
    return `${window.location.origin}/hub/shared/${token}`;
  }

  const inputCls =
    "w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

  const activeTokens = (tokens || []).filter((t) => !t.revokedAt);

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        You decide who sees this thread. Invite a provider, or create a private link. You can take access away at any time.
      </p>

      {/* Provider grants */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Providers with access</h3>
        <div className="space-y-2">
          {grants === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : grants.length === 0 ? (
            <p className="text-sm text-gray-500">No providers yet. Add one below.</p>
          ) : (
            grants.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-gray-800">{g.granteeName || g.granteeUsername || g.granteeId}</div>
                  <div className="text-xs text-gray-500">
                    {[g.granteeRole, g.granteeOrg].filter(Boolean).join(" · ") || g.granteeUsername}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      g.access === "write" ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {g.access === "write" ? "Can add visits" : "Read only"}
                  </span>
                  <button onClick={() => revokeGrant(g.id)} className="text-xs font-medium text-red-600 hover:underline">
                    Revoke
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 p-3">
          <label className="mb-1 block text-xs font-medium text-gray-500">Invite a provider by email</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={granteeUsername}
              onChange={(e) => setGranteeUsername(e.target.value)}
              placeholder="doctor@clinic.example"
              className={inputCls}
            />
            <select
              value={grantAccess}
              onChange={(e) => setGrantAccess(e.target.value as AccessLevel)}
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="read">Read only</option>
              <option value="write">Can add visits</option>
            </select>
            <Button onClick={addGrant} disabled={grantBusy || !granteeUsername.trim()}>
              {grantBusy ? "Sharing…" : "Share"}
            </Button>
          </div>
          {grantError && <p className="mt-2 text-sm text-red-600">{grantError}</p>}
        </div>
      </div>

      {/* Share links */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Private links</h3>
        <p className="mb-2 text-xs text-gray-500">
          Anyone with the link can view this thread, read-only — no account needed. Revoke it whenever you want.
        </p>
        <div className="space-y-2">
          {tokens === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : activeTokens.length === 0 ? (
            <p className="text-sm text-gray-500">No active links.</p>
          ) : (
            activeTokens.map((t) => (
              <div key={t.token} className="rounded-xl border border-gray-200 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{t.label || "Share link"}</span>
                  <button onClick={() => revokeLink(t.token)} className="text-xs font-medium text-red-600 hover:underline">
                    Revoke
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-500">{linkUrl(t.token)}</code>
                  <CopyButton text={linkUrl(t.token)} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-gray-200 p-3 sm:flex-row">
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label (optional) — e.g. For the pharmacy"
            className={inputCls}
          />
          <Button variant="secondary" onClick={createLink} disabled={linkBusy}>
            {linkBusy ? "Creating…" : "Create read-only link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
