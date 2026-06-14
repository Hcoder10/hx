"use client";

// Patient dashboard: greet by name, list my threads (repos) as warm cards, a
// "+ New thread" action, and a prominent SAFETY panel of cross-repo interaction
// alerts (GET /api/hub/alerts). This is the heart of the Hub — one med list
// across every provider, catching what no single record could see.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type Alert, type RepoCard } from "../lib";
import { useMe } from "../components/useMe";
import { AccessBadge, Button, Card, HubHeader, Spinner, SyntheticBanner } from "../components/ui";
import { SafetyPanel } from "../components/SafetyPanel";
import VoiceAgent from "../components/VoiceAgent";

export default function PatientDashboard() {
  const { me, loading } = useMe("patient");
  const [repos, setRepos] = useState<RepoCard[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRepos = useCallback(async () => {
    const { repos } = await api<{ repos: RepoCard[] }>("/api/repos");
    setRepos(repos);
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const { alerts } = await api<{ alerts: Alert[] }>("/api/hub/alerts");
      setAlerts(alerts);
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    loadRepos().catch(() => setRepos([]));
    loadAlerts();
  }, [me, loadRepos, loadAlerts]);

  async function createThread() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/repos", { method: "POST", body: JSON.stringify({ name: trimmed, description: description.trim() || undefined }) });
      setName("");
      setDescription("");
      setShowNew(false);
      await loadRepos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create thread.");
    } finally {
      setCreating(false);
    }
  }

  if (loading || !me) {
    return (
      <main className="min-h-screen bg-gray-50">
        <Spinner label="Loading your record…" />
      </main>
    );
  }

  const firstName = me.displayName.split(" ")[0];

  return (
    <main className="min-h-screen bg-gray-50">
      <HubHeader me={me} />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Hi, {firstName}</h1>
          <p className="text-sm text-gray-500">Here&apos;s your health story, kept safely in your hands.</p>
        </div>

        {/* Safety first — this is the whole point of the Hub. */}
        <SafetyPanel alerts={alerts} />

        {/* Voice check-in (patient agent: PHQ-9/GAD-7 + ask about meds) */}
        <div className="mt-4">
          <VoiceAgent role="patient" label="Talk to Hx — voice check-in" />
        </div>

        {/* Threads */}
        <div className="mt-7 mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Your threads</h2>
          <Button variant="ghost" onClick={() => setShowNew((s) => !s)}>
            + New thread
          </Button>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Each thread is a separate area of your care (like Primary Care or Mental Health). Every visit is saved as a new
          version — like git, for your health.
        </p>

        {showNew && (
          <Card className="mb-4">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Thread name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cardiology"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Description (optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this thread is for"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button onClick={createThread} disabled={creating || !name.trim()}>
                  {creating ? "Creating…" : "Create thread"}
                </Button>
                <Button variant="secondary" onClick={() => setShowNew(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        {repos === null ? (
          <Spinner />
        ) : repos.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-500">No threads yet. Create your first one above to start your record.</p>
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
