"use client";

// Provider dashboard: "Repos shared with me" (GET /api/repos returns granted
// repos for providers) as cards. Makes clear they only see what the patient
// chose to share, at the access level the patient granted.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type RepoCard } from "../lib";
import { useMe } from "../components/useMe";
import { AccessBadge, Card, HubHeader, Spinner, SyntheticBanner } from "../components/ui";

export default function ProviderDashboard() {
  const { me, loading } = useMe("provider");
  const [repos, setRepos] = useState<RepoCard[] | null>(null);

  useEffect(() => {
    if (!me) return;
    api<{ repos: RepoCard[] }>("/api/repos")
      .then(({ repos }) => setRepos(repos))
      .catch(() => setRepos([]));
  }, [me]);

  if (loading || !me) {
    return (
      <main className="min-h-screen bg-gray-50">
        <Spinner label="Loading…" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <HubHeader me={me} />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{me.displayName}</h1>
          <p className="text-sm text-gray-500">
            {me.providerRole ? `${me.providerRole}${me.org ? ` · ${me.org}` : ""}` : me.org || "Provider"}
          </p>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 11c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4Z" stroke="currentColor" strokeWidth="2" />
              <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <p className="text-sm text-sky-900">
            You only see the threads patients have explicitly shared with you — and only at the access level they granted.
            Patients can revoke access at any time.
          </p>
        </div>

        <h2 className="mb-3 text-lg font-semibold text-gray-900">Shared with you</h2>

        {repos === null ? (
          <Spinner />
        ) : repos.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500">
              No patient has shared a thread with you yet. When a patient grants you access, it will appear here.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {repos.map((r) => (
              <Link key={r.id} href={`/hub/repo/${r.id}`} className="group">
                <Card className="h-full transition group-hover:border-teal-300 group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 group-hover:text-teal-700">{r.name}</h3>
                    <AccessBadge access={r.access} />
                  </div>
                  {r.description && <p className="mt-1 text-sm text-gray-500">{r.description}</p>}
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                    <span className="inline-flex items-center gap-1">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="12" cy="6" r="3" stroke="currentColor" strokeWidth="2" />
                        <circle cx="12" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 9v6" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      {r.visitCount} {r.visitCount === 1 ? "visit" : "visits"}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <SyntheticBanner />
      </div>
    </main>
  );
}
