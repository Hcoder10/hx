"use client";

// One thread (repo): the visit timeline (each commit = a visit), the current
// section files (medications / problems / allergies), an "Add visit" form for
// writers, a Sharing section for the owner, and a link to the merge-conflict demo.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, formatDate, type Repo, type VisitCommit } from "../../lib";
import { useMe } from "../../components/useMe";
import { Button, Card, HubHeader, OidPill, Spinner, SyntheticBanner } from "../../components/ui";
import { Markdown } from "../../components/Markdown";
import { AddVisitForm } from "../../components/AddVisitForm";
import { SharingPanel } from "../../components/SharingPanel";
import VoiceAgent from "../../components/VoiceAgent";

type RepoResponse = { repo: Repo; log: VisitCommit[] };
type FilesResponse = { files: { medications: string; problems: string; allergies: string }; plan: string | null };

export default function RepoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, loading } = useMe();
  const [data, setData] = useState<RepoResponse | null>(null);
  const [files, setFiles] = useState<FilesResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [tab, setTab] = useState<"timeline" | "current">("timeline");

  const load = useCallback(async () => {
    try {
      const res = await api<RepoResponse>(`/api/repos/${id}`);
      setData(res);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 403 || status === 404) setForbidden(true);
      throw e;
    }
    try {
      const f = await api<FilesResponse>(`/api/repos/${id}/files`);
      setFiles(f);
    } catch {
      setFiles({ files: { medications: "", problems: "", allergies: "" }, plan: null });
    }
  }, [id]);

  useEffect(() => {
    if (!me) return;
    load().catch(() => {});
  }, [me, load]);

  if (loading || !me) {
    return (
      <main className="min-h-screen bg-gray-50">
        <Spinner label="Loading…" />
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="min-h-screen bg-gray-50">
        <HubHeader me={me} />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-gray-600">You don&apos;t have access to this thread.</p>
          <Link href={me.role === "provider" ? "/hub/provider" : "/hub/patient"} className="mt-3 inline-block text-teal-700 hover:underline">
            ← Back to your dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-50">
        <HubHeader me={me} />
        <Spinner />
      </main>
    );
  }

  const { repo, log } = data;
  const isOwner = repo.ownerId === me.id;
  // Owner is always a writer; a provider needs a write grant. We infer write by
  // checking the repos list access, but simplest: owner OR (the API will reject
  // a non-writer's POST). Surface the form to owner + write-granted providers.
  const canWrite = isOwner || me.role === "provider"; // provider write enforced server-side

  return (
    <main className="min-h-screen bg-gray-50">
      <HubHeader me={me} />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link
          href={me.role === "provider" ? "/hub/provider" : "/hub/patient"}
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← {me.role === "provider" ? "Shared with me" : "Your threads"}
        </Link>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{repo.name}</h1>
          {repo.description && <p className="text-sm text-gray-500">{repo.description}</p>}
          <p className="mt-1 text-xs text-gray-400">
            {log.length} {log.length === 1 ? "saved version" : "saved versions"} · this is a real git repository
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-4 inline-flex rounded-xl bg-gray-100 p-1 text-sm">
          <button
            onClick={() => setTab("timeline")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${tab === "timeline" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"}`}
          >
            Visit history
          </button>
          <button
            onClick={() => setTab("current")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${tab === "current" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"}`}
          >
            Current record
          </button>
        </div>

        {tab === "timeline" ? (
          <Timeline log={log} />
        ) : (
          <CurrentRecord files={files} />
        )}

        {/* Voice agent — provider dictates the visit; patient talks to their thread */}
        {canWrite && (
          <div className="mt-6">
            <VoiceAgent
              role={me.role === "provider" ? "provider" : "patient"}
              repoId={id}
              label={me.role === "provider" ? "Provider voice agent — dictate this visit" : "Talk to Hx about this thread"}
            />
          </div>
        )}

        {/* Add visit */}
        {canWrite && (
          <div className="mt-6">
            <AddVisitForm repoId={id} onAdded={() => load()} />
          </div>
        )}

        {/* Merge conflict demo link */}
        {canWrite && (
          <Card className="mt-6 border-violet-200 bg-violet-50/60">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Two doctors edited at once?</h3>
                <p className="text-sm text-gray-600">
                  See how Hx safely reconciles conflicting updates — a real git merge, made human.
                </p>
              </div>
              <Link href={`/hub/repo/${id}/conflicts`}>
                <Button variant="secondary">Show merge conflict demo →</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Sharing (owner only) */}
        {isOwner && (
          <Card className="mt-6">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Sharing</h2>
            <SharingPanel repoId={id} />
          </Card>
        )}

        <SyntheticBanner />
      </div>
    </main>
  );
}

function Timeline({ log }: { log: VisitCommit[] }) {
  if (log.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500">No visits recorded yet.</p>
      </Card>
    );
  }
  return (
    <div className="relative space-y-0">
      {log.map((c, i) => (
        <div key={c.oid} className="relative flex gap-4 pb-5">
          {/* rail */}
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
            {c.parents.length > 1 && (
              <span className="mt-2 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                merge of {c.parents.length} versions
              </span>
            )}
          </Card>
        </div>
      ))}
    </div>
  );
}

function CurrentRecord({ files }: { files: FilesResponse | null }) {
  if (!files) return <Spinner />;
  const sections: { title: string; text: string }[] = [
    { title: "Medications", text: files.files.medications },
    { title: "Problems", text: files.files.problems },
    { title: "Allergies", text: files.files.allergies },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        The current state of this thread, rebuilt from every saved version (this is the file at <span className="font-mono">HEAD</span>).
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.title}>
            <h3 className="mb-1 text-sm font-semibold text-gray-900">{s.title}</h3>
            <Markdown text={stripTopHeading(s.text)} />
          </Card>
        ))}
      </div>
      {files.plan && (
        <Card className="border-violet-200">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">Care plan</h3>
          <Markdown text={stripTopHeading(files.plan)} />
        </Card>
      )}
    </div>
  );
}

// The section files start with a "# Medications" heading that duplicates the card
// title — drop the first heading line for a cleaner card.
function stripTopHeading(text: string): string {
  const lines = (text || "").split("\n");
  if (lines[0]?.startsWith("# ")) return lines.slice(1).join("\n").trim();
  return text;
}
