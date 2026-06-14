"use client";

// "Add visit" form (write access only). Posts a new commit to
// POST /api/repos/[id]/visits. Everything but a title is optional so a provider
// can make a small, focused commit (just a note, just a medicine). Medications /
// problems / allergies are entered as simple repeatable rows.

import { useState } from "react";
import { api } from "../lib";
import { Button } from "./ui";

type MedRow = { name: string; dose: string; reason: string };

export function AddVisitForm({ repoId, onAdded }: { repoId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [date, setDate] = useState("2026-06-13");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [meds, setMeds] = useState<MedRow[]>([]);
  const [problems, setProblems] = useState("");
  const [allergies, setAllergies] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setPlace("");
    setSummary("");
    setNotes("");
    setMeds([]);
    setProblems("");
    setAllergies("");
    setError(null);
  }

  async function submit() {
    if (!title.trim()) {
      setError("Please give the visit a short title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        place: place.trim() || undefined,
        date,
        summary: summary.trim() || undefined,
      };
      const noteLines = notes
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean);
      if (noteLines.length) body.notes = noteLines;

      const medRows = meds.filter((m) => m.name.trim());
      if (medRows.length)
        body.addMedications = medRows.map((m) => ({ name: m.name.trim(), dose: m.dose.trim(), reason: m.reason.trim() }));

      const probLines = problems
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean);
      if (probLines.length) body.addProblems = probLines.map((name) => ({ name }));

      const allergyLines = allergies
        .split("\n")
        .map((a) => a.trim())
        .filter(Boolean);
      if (allergyLines.length) body.addAllergies = allergyLines.map((substance) => ({ substance }));

      await api(`/api/repos/${repoId}/visits`, { method: "POST", body: JSON.stringify(body) });
      reset();
      setOpen(false);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the visit.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Add a visit
      </Button>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500";

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
      <h3 className="mb-3 font-semibold text-gray-900">New visit</h3>
      <p className="mb-3 text-xs text-gray-500">
        Saving creates a new version (a git commit) on this thread. Add as much or as little as you like.
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Follow-up visit" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Place (optional)</label>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Clinic or hospital" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Summary (optional)</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What happened, in plain language."
            rows={2}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Notes (one per line, optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
        </div>

        {/* Medications */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-500">Medications added (optional)</label>
            <button
              onClick={() => setMeds((m) => [...m, { name: "", dose: "", reason: "" }])}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              + Add medicine
            </button>
          </div>
          <div className="space-y-2">
            {meds.map((m, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_0.6fr_1fr_auto]">
                <input
                  value={m.name}
                  onChange={(e) => setMeds((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="Name"
                  className={inputCls}
                />
                <input
                  value={m.dose}
                  onChange={(e) => setMeds((arr) => arr.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)))}
                  placeholder="Dose"
                  className={inputCls}
                />
                <input
                  value={m.reason}
                  onChange={(e) => setMeds((arr) => arr.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))}
                  placeholder="Reason"
                  className={inputCls}
                />
                <button
                  onClick={() => setMeds((arr) => arr.filter((_, j) => j !== i))}
                  className="rounded-xl border border-gray-300 px-3 text-sm text-gray-500 hover:bg-gray-50"
                  aria-label="Remove medicine"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Problems added (one per line)</label>
            <textarea value={problems} onChange={(e) => setProblems(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Allergies added (one per line)</label>
            <textarea value={allergies} onChange={(e) => setAllergies(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {busy ? "Saving…" : "Save visit (commit)"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
              reset();
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
