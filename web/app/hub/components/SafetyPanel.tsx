"use client";

// The cross-repo SAFETY panel. Renders the alerts from GET /api/hub/alerts with
// strong severity colors, plain-language explanation, what-to-do steps, the meds
// involved (with provenance), and a copyable call script. Collapsed by default
// per alert so the list stays scannable.

import { useState } from "react";
import { type Alert, severityStyles } from "../lib";
import { CopyButton } from "./CopyButton";

export function SafetyPanel({ alerts }: { alerts: Alert[] | null }) {
  if (alerts === null) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-400 shadow-sm">
        Checking your medicines across every doctor…
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <p className="font-semibold text-emerald-900">No medicine conflicts found</p>
          <p className="text-sm text-emerald-700">We checked every medicine across all your doctors. Nothing looks unsafe together right now.</p>
        </div>
      </div>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="text-lg font-semibold text-gray-900">Safety check</h2>
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          {alerts.length} {alerts.length === 1 ? "alert" : "alerts"}
        </span>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Found by looking at every medicine across all your threads together — something no single doctor&apos;s record can do.
      </p>
      <div className="space-y-3">
        {alerts.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>
    </section>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const [open, setOpen] = useState(alert.severity === "high");
  const s = severityStyles[alert.severity];

  return (
    <div className={`overflow-hidden rounded-2xl border ${s.ring} ${s.bg} shadow-sm`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 p-4 text-left">
        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${s.chip}`}>
          {s.label}
        </span>
        <span className="flex-1">
          <span className={`block font-semibold ${s.text}`}>{alert.title}</span>
          <span className={`block text-sm ${s.text} opacity-90`}>{alert.summary}</span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className={`mt-1 shrink-0 transition ${open ? "rotate-180" : ""} ${s.text} opacity-60`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4 border-t border-black/5 bg-white/60 p-4">
          <p className="text-sm text-gray-700">{alert.explanation}</p>

          {alert.involved.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Medicines involved</p>
              <ul className="space-y-1">
                {alert.involved.map((m, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-gray-900">{m.name}</span>
                    <span className="text-gray-500">from {m.provider}</span>
                    <span className="text-gray-400">· {m.date}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alert.whatToDo.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">What you can do</p>
              <ul className="space-y-1">
                {alert.whatToDo.map((step, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {alert.script && (
            <div className="rounded-xl bg-gray-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">What to say when you call</p>
                <CopyButton text={alert.script} label="Copy" />
              </div>
              <p className="text-sm italic text-gray-700">&ldquo;{alert.script}&rdquo;</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
