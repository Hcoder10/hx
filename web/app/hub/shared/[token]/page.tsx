"use client";

// Read-only public view of a shared thread via a share link (GET /api/shared/
// [token]). NO login — the unguessable token IS the credential. Banner makes the
// read-only, patient-shared nature obvious.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, formatDate, type Repo, type VisitCommit } from "../../lib";
import { Card, OidPill, Spinner, SyntheticBanner } from "../../components/ui";

type SharedResponse = {
  repo: Repo;
  access: "read" | "write";
  owner?: { displayName: string };
  log: VisitCommit[];
};

export default function SharedView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<SharedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SharedResponse>(`/api/shared/${token}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "This link is invalid or has expired."));
  }, [token]);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <div className="text-2xl font-bold text-teal-700">Hx</div>
          <p className="mt-4 text-gray-600">{error}</p>
          <p className="mt-1 text-sm text-gray-400">Ask the patient for a fresh link.</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-50">
        <Spinner label="Opening shared record…" />
      </main>
    );
  }

  const { repo, owner, log } = data;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Read-only banner */}
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 text-sm text-amber-900">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>
            Shared by {owner?.displayName ? <strong>{owner.displayName}</strong> : "the patient"} · read-only
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-lg font-bold text-teal-700">Hx</span>
          <span className="text-sm text-gray-400">shared record</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{repo.name}</h1>
        {repo.description && <p className="text-sm text-gray-500">{repo.description}</p>}
        <p className="mt-1 text-xs text-gray-400">
          {log.length} {log.length === 1 ? "saved version" : "saved versions"} · real git history
        </p>

        <div className="mt-5 space-y-0">
          {log.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500">No visits recorded yet.</p>
            </Card>
          ) : (
            log.map((c, i) => (
              <div key={c.oid} className="relative flex gap-4 pb-5">
                <div className="flex flex-col items-center">
                  <span className="mt-1.5 flex h-3 w-3 shrink-0 rounded-full bg-teal-500 ring-4 ring-teal-100" />
                  {i < log.length - 1 && <span className="w-px flex-1 bg-gray-200" />}
                </div>
                <Card className="flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{c.message.split(" — ")[0]}</p>
                      <p className="text-xs text-gray-500">
                        {c.authorName} · {formatDate(c.date)}
                      </p>
                    </div>
                    <OidPill oid={c.oid} short={c.shortOid} />
                  </div>
                  {c.message.includes(" — ") && (
                    <p className="mt-1 text-sm text-gray-500">{c.message.split(" — ").slice(1).join(" — ")}</p>
                  )}
                </Card>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/hub" className="text-sm text-teal-700 hover:underline">
            What is Hx? →
          </Link>
        </div>

        <SyntheticBanner />
      </div>
    </main>
  );
}
