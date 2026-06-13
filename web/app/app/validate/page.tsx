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
type Result = { encounterTitle: string; accepted: number; flagged: number; entries: Entry[] };

const REASON_LABEL: Record<string, string> = {
  ok: "verified",
  no_code: "no matching code — needs manual coding",
  code_not_found: "code doesn't exist — refused",
  system_mismatch: "wrong code system — refused",
  weak_match: "code doesn't match the term — refused",
};

export default function Validate() {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(tamper: boolean) {
    setLoading(true);
    try {
      const r = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tamper }),
      });
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/app" className="text-sm text-teal-700">
        ← Back
      </Link>
      <header>
        <h1 className="text-xl font-bold text-gray-900">Data validation</h1>
        <p className="text-sm text-gray-500">
          Messy provider text → coded against public code sets (ICD-10 / RxNorm / LOINC / UNII) → a{" "}
          <strong>deterministic verifier</strong> decides what may enter your record.
        </p>
      </header>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Raw ER note</div>
        <p className="mt-1">
          Problems: high BP · type II DM · feeling really down lately<br />
          Meds: zoloft 100 · ultram 50 · atorvastatin 20<br />
          Allergy: penicillin (rash) · BP 150/95 · A1c 8.2%
        </p>
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
      </div>

      {data && (
        <>
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-teal-700">{data.accepted} verified</span>
            {" · "}
            <span className="font-semibold text-red-600">{data.flagged} refused/flagged</span> — only verified
            entries are written to the record.
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
                  {e.accepted
                    ? `verified → ${e.matchedDescription} (match ${e.similarity})`
                    : e.note || REASON_LABEL[e.reason] || e.reason}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            The verifier is pure, deterministic, dependency-free: a code is accepted only if it exists in the
            public set AND its official description matches the claimed term. The coding model (Grok today, a
            fine-tuned 9B Qwen later) is never trusted.
          </p>
        </>
      )}
    </main>
  );
}
