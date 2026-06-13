import Link from "next/link";
import { getMedications, getAlerts } from "@/lib/hx";

export const dynamic = "force-dynamic";

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export default function Medications() {
  const meds = getMedications();
  const alerts = getAlerts();
  const flagged = new Set(
    alerts.flatMap((a) => a.involved.map((m) => m.name.split(" ")[0].toLowerCase())),
  );

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <Link href="/app" className="text-sm text-teal-700">
        ← Back
      </Link>
      <h1 className="text-xl font-bold text-gray-900">Your medicines</h1>
      <ul className="space-y-3">
        {meds.map((m, i) => {
          const flag = flagged.has(m.name.toLowerCase());
          return (
            <li
              key={i}
              className={`rounded-2xl border p-4 ${
                flag ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className="font-semibold text-gray-900">
                {m.name} {m.dose} {flag ? "⚠️" : ""}
              </div>
              <div className="text-sm text-gray-600">for {m.reason}</div>
              <div className="text-xs text-gray-400">
                Added by {m.providerName} ({m.providerRole}) on {fmt(m.date)}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
