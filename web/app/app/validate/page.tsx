"use client";

import { useState } from "react";
import Link from "next/link";

type Entry = {
  section: string;
  system: string;
  term: string;
  code: string;
  accepted: boolean;
  reason: string;
  note?: string;
  similarity: number;
  matchedDescription?: string;
};
type Result = { accepted: number; flagged: number; entries: Entry[] };

const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

export default function Validate() {
  const [problems, setProblems] = useState("high BP\ntype II DM\nfeeling really down lately");
  const [meds, setMeds] = useState("zoloft\nultram\natorvastatin\nzorblax");
  const [allergies, setAllergies] = useState("penicillin");
  const [notes, setNotes] = useState("Systolic blood pressure 150\nA1c 8.2%");
  const [data, setData] = useState<Result | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(tamper: boolean) {
    setLoading(true);
    setData(null);
    const encounter = {
      id: "user-note",
      date: "2026-06-13",
      providerId: "er",
      title: "Editable note",
      place: "Hx demo",
      summary: "",
      notes: lines(notes),
      addProblems: lines(problems).map((name) => ({ name })),
      addMedications: lines(meds).map((name) => ({ name })),
      addAllergies: lines(allergies).map((substance) => ({ substance })),
    };
    const t0 = performance.now();
    try {
      const r = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encounter, tamper }),
      });
      setData(await r.json());
      setMs(Math.round(performance.now() - t0));
    } finally {
      setLoading(false);
    }
  }

  const ta = "w-full rounded-xl border border-gray-300 p-2 text-sm font-mono";

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/app" className="text-sm text-teal-700">
        ← Back
      </Link>
      <header>
        <h1 className="text-xl font-bold text-gray-900">Data validation</h1>
        <p className="text-sm text-gray-500">
          Type any messy note. Hx codes it against public code sets (ICD-10 / RxNorm / LOINC / UNII)
          with Grok, then a <strong>deterministic verifier</strong> decides what may enter the record.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-gray-500">
          Problems
          <textarea className={ta} rows={3} value={problems} onChange={(e) => setProblems(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-gray-500">
          Medications
          <textarea className={ta} rows={3} value={meds} onChange={(e) => setMeds(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-gray-500">
          Allergies
          <textarea className={ta} rows={2} value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-gray-500">
          Notes / vitals
          <textarea className={ta} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(false)}
          disabled={loading}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? "Coding…" : "Code + verify"}
        </button>
        <button
          onClick={() => run(true)}
          disabled={loading}
          className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Simulate a hallucinated AI code
        </button>
        {ms !== null && <span className="self-center text-xs text-gray-400">{ms} ms (Grok)</span>}
      </div>

      {data && (
        <>
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-teal-700">{data.accepted} verified</span> ·{" "}
            <span className="font-semibold text-red-600">{data.flagged} refused/flagged</span> — only
            verified entries are written to the record.
          </div>
          <ul className="space-y-2">
            {data.entries.map((e, i) => (
              <li
                key={i}
                className={`rounded-2xl border p-3 ${
                  e.accepted ? "border-teal-200 bg-teal-50" : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {e.accepted ? "✓" : "⚠️"} {e.term}
                    <span className="ml-2 text-xs text-gray-400">{e.section}</span>
                  </span>
                  <span className={`font-mono text-sm ${e.accepted ? "text-teal-700" : "text-red-600"}`}>
                    {e.system} {e.code || "—"}
                  </span>
                </div>
                <div className={`mt-1 text-xs ${e.accepted ? "text-teal-800" : "text-red-700"}`}>
                  {e.accepted ? `verified → ${e.matchedDescription} (match ${e.similarity})` : e.note || e.reason}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            Deterministic verifier: accepts a code only if it exists in the public set AND its official
            description matches the claimed term. The coder (Grok now, a fine-tuned model later) is never trusted.
          </p>
        </>
      )}
    </main>
  );
}
