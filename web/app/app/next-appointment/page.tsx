"use client";

import { useState } from "react";
import Link from "next/link";
import rec from "@/lib/hx/recommendation.json";

type Opt = {
  name: string;
  org: string;
  blurb: string;
  predicted: number;
  ci: number;
  p_good: number;
  similar_n: number;
  recommended?: boolean;
  why?: string;
};
type Persona = { id: string; name: string; summary: string; options: Opt[] };

export default function NextAppointment() {
  const personas = rec.personas as Persona[];
  const [i, setI] = useState(0);
  const p = personas[i];
  const top = p.options[0];
  const rest = p.options.slice(1);

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <Link href="/app" className="text-sm text-teal-700">
        ← Back
      </Link>
      <header>
        <h1 className="text-xl font-bold text-gray-900">Your next appointment</h1>
        <p className="text-sm text-gray-500">{rec.decision}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {personas.map((pp, idx) => (
          <button
            key={pp.id}
            onClick={() => setI(idx)}
            className={`rounded-full px-3 py-1 text-sm ${
              idx === i ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {pp.name}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-600">{p.summary}</p>

      <div className="rounded-2xl border-2 border-teal-500 bg-teal-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">✓ Recommended for you</div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-lg font-bold text-gray-900">{top.name}</div>
            <div className="text-sm text-gray-500">{top.org}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-teal-700">{top.predicted}</div>
            <div className="text-xs text-gray-500">expected benefit ±{top.ci}</div>
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-700">{top.blurb}</p>
        {top.why && <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm text-teal-900">{top.why}</p>}
        <div className="mt-2 text-xs text-gray-500">Based on {top.similar_n} patients like you.</div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Other options, ranked</div>
        {rest.map((o) => (
          <div key={o.name} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
            <div>
              <div className="font-medium text-gray-900">{o.name}</div>
              <div className="text-xs text-gray-500">{o.org}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-gray-700">{o.predicted}</div>
              <div className="text-xs text-gray-400">±{o.ci}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">{rec.method}. {rec.disclaimer}</p>
    </main>
  );
}
