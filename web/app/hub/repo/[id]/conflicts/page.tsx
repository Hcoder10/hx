"use client";

// MERGE CONFLICT resolution UI. Drives POST /api/repos/[id]/merge:
//   1. "simulate" -> two providers branch from HEAD and edit the SAME care-plan
//      file differently (returns the branch names + the detected conflicts).
//   2. For each conflict, show ours vs theirs side-by-side (labelled by provider
//      + date). The user picks a side, or edits a combined version.
//   3. "resolve" -> write a real MERGE commit (two parents) and fast-forward main.
//
// Plain-language framing for patients, with the real git underneath for judges.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, type MergeConflict, type Repo } from "../../../lib";
import { useMe } from "../../../components/useMe";
import { Button, Card, HubHeader, OidPill, Spinner, SyntheticBanner } from "../../../components/ui";

type SimResponse = { ok: true; ours: string; theirs: string; filepath: string; conflicts: MergeConflict[] };

type Choice = "ours" | "theirs" | "edit";

export default function ConflictsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, loading } = useMe();
  const [repo, setRepo] = useState<Repo | null>(null);

  const [branches, setBranches] = useState<{ ours: string; theirs: string } | null>(null);
  const [conflicts, setConflicts] = useState<MergeConflict[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [resolvedOid, setResolvedOid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRepo = useCallback(async () => {
    try {
      const { repo } = await api<{ repo: Repo }>(`/api/repos/${id}`);
      setRepo(repo);
    } catch {
      /* ignore — header still works */
    }
  }, [id]);

  useEffect(() => {
    if (!me) return;
    loadRepo();
  }, [me, loadRepo]);

  async function simulate() {
    setBusy(true);
    setError(null);
    setResolvedOid(null);
    try {
      const res = await api<SimResponse>(`/api/repos/${id}/merge`, {
        method: "POST",
        body: JSON.stringify({ action: "simulate" }),
      });
      setBranches({ ours: res.ours, theirs: res.theirs });
      setConflicts(res.conflicts);
      // default every conflict to "ours" and seed the edit buffer with a merge.
      const c: Record<string, Choice> = {};
      const e: Record<string, string> = {};
      for (const cf of res.conflicts) {
        c[cf.filepath] = "ours";
        e[cf.filepath] = combine(cf);
      }
      setChoices(c);
      setEdits(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the demo.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!branches || !conflicts) return;
    setBusy(true);
    setError(null);
    try {
      const resolutions = conflicts.map((cf) => {
        const choice = choices[cf.filepath] || "ours";
        const content = choice === "ours" ? cf.ours : choice === "theirs" ? cf.theirs : edits[cf.filepath] ?? cf.ours;
        return { filepath: cf.filepath, content };
      });
      const { oid } = await api<{ ok: true; oid: string }>(`/api/repos/${id}/merge`, {
        method: "POST",
        body: JSON.stringify({ action: "resolve", ours: branches.ours, theirs: branches.theirs, resolutions }),
      });
      setResolvedOid(oid);
      setConflicts(null);
      setBranches(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the merge.");
    } finally {
      setBusy(false);
    }
  }

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
        <Link href={`/hub/repo/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          ← Back to {repo?.name || "thread"}
        </Link>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Reconciling two updates</h1>
          <p className="text-sm text-gray-500">
            Two doctors changed the same care plan at the same time. Hx shows both, lets you decide, and keeps a record of
            the decision — exactly like resolving a git merge conflict, but in plain language.
          </p>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* Success state */}
        {resolvedOid && (
          <Card className="mb-4 border-emerald-200 bg-emerald-50">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div>
                <p className="font-semibold text-emerald-900">Merged and saved</p>
                <p className="text-sm text-emerald-700">
                  Both updates have been reconciled into a single merge commit. The thread&apos;s history now records who
                  changed what and how it was resolved.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <OidPill oid={resolvedOid} />
                  <Link href={`/hub/repo/${id}`} className="text-sm font-medium text-teal-700 hover:underline">
                    View the thread →
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Start */}
        {!conflicts && !resolvedOid && (
          <Card>
            <p className="mb-3 text-sm text-gray-600">
              Click below to simulate two providers editing the care plan at the same time. Hx will detect the clash and
              walk you through resolving it.
            </p>
            <Button onClick={simulate} disabled={busy}>
              {busy ? "Setting up…" : "Simulate a conflicting edit"}
            </Button>
          </Card>
        )}

        {/* Resolution */}
        {conflicts && branches && (
          <div className="space-y-4">
            <Card className="border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 text-amber-900">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm font-medium">
                  {conflicts.length} file{conflicts.length === 1 ? "" : "s"} changed on both sides. Choose what to keep.
                </p>
              </div>
            </Card>

            {conflicts.map((cf) => (
              <ConflictCard
                key={cf.filepath}
                conflict={cf}
                choice={choices[cf.filepath] || "ours"}
                edit={edits[cf.filepath] ?? combine(cf)}
                onChoice={(ch) => setChoices((c) => ({ ...c, [cf.filepath]: ch }))}
                onEdit={(text) => setEdits((e) => ({ ...e, [cf.filepath]: text }))}
              />
            ))}

            <div className="flex gap-2">
              <Button onClick={resolve} disabled={busy}>
                {busy ? "Merging…" : "Resolve & save merge"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConflicts(null);
                  setBranches(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <SyntheticBanner />
      </div>
    </main>
  );
}

function ConflictCard({
  conflict,
  choice,
  edit,
  onChoice,
  onEdit,
}: {
  conflict: MergeConflict;
  choice: Choice;
  edit: string;
  onChoice: (c: Choice) => void;
  onEdit: (text: string) => void;
}) {
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-xs text-gray-400">{conflict.filepath}</span>
        <span className="text-xs text-gray-400">— both doctors rewrote this</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Side
          label="Version A"
          who={conflict.oursLabel}
          content={conflict.ours}
          selected={choice === "ours"}
          onSelect={() => onChoice("ours")}
          color="teal"
        />
        <Side
          label="Version B"
          who={conflict.theirsLabel}
          content={conflict.theirs}
          selected={choice === "theirs"}
          onSelect={() => onChoice("theirs")}
          color="violet"
        />
      </div>

      <div className="mt-3">
        <button
          onClick={() => onChoice("edit")}
          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
            choice === "edit" ? "border-gray-400 bg-gray-50" : "border-gray-200 hover:bg-gray-50"
          }`}
        >
          <span className="font-medium text-gray-800">Or write a combined version</span>
          <span className={`h-4 w-4 rounded-full border-2 ${choice === "edit" ? "border-gray-700 bg-gray-700" : "border-gray-300"}`} />
        </button>
        {choice === "edit" && (
          <textarea
            value={edit}
            onChange={(e) => onEdit(e.target.value)}
            rows={7}
            className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        )}
      </div>
    </Card>
  );
}

function Side({
  label,
  who,
  content,
  selected,
  onSelect,
  color,
}: {
  label: string;
  who: string;
  content: string;
  selected: boolean;
  onSelect: () => void;
  color: "teal" | "violet";
}) {
  const ring = selected
    ? color === "teal"
      ? "border-teal-400 ring-2 ring-teal-200"
      : "border-violet-400 ring-2 ring-violet-200"
    : "border-gray-200 hover:border-gray-300";
  return (
    <button onClick={onSelect} className={`rounded-xl border bg-white p-3 text-left transition ${ring}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wide ${color === "teal" ? "text-teal-700" : "text-violet-700"}`}>{label}</span>
        <span className={`h-4 w-4 rounded-full border-2 ${selected ? (color === "teal" ? "border-teal-600 bg-teal-600" : "border-violet-600 bg-violet-600") : "border-gray-300"}`} />
      </div>
      <p className="mb-2 text-xs text-gray-500">{who}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 font-mono text-[11px] leading-relaxed text-gray-700">
        {content}
      </pre>
    </button>
  );
}

// A naive starting point for the "combined" buffer: ours followed by theirs'
// unique lines. The user edits from here; this is just a convenience.
function combine(cf: MergeConflict): string {
  const oursLines = cf.ours.split("\n");
  const theirsLines = cf.theirs.split("\n");
  const seen = new Set(oursLines.map((l) => l.trim()));
  const extra = theirsLines.filter((l) => l.trim() && !seen.has(l.trim()));
  return extra.length ? `${cf.ours.trimEnd()}\n${extra.join("\n")}\n` : cf.ours;
}
