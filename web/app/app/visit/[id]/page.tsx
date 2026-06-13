import Link from "next/link";
import { notFound } from "next/navigation";
import { getVisit } from "@/lib/hx";

export const dynamic = "force-dynamic";

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export default async function Visit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = getVisit(id);
  if (!v) notFound();

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <Link href="/app" className="text-sm text-teal-700">
        ← Back
      </Link>
      <h1 className="text-xl font-bold text-gray-900">{v.title}</h1>
      <div className="text-sm text-gray-500">
        {fmt(v.date)} · {v.place} · {v.provider.name} ({v.provider.role})
      </div>
      <p className="text-gray-700">{v.summary}</p>

      {v.notes?.length ? (
        <div className="rounded-2xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900">Notes</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
            {v.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {v.addMedications?.length ? (
        <div className="rounded-2xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900">Medicines started here</h2>
          <ul className="mt-1 space-y-1 text-sm text-gray-700">
            {v.addMedications.map((m, i) => (
              <li key={i}>
                💊 {m.name} {m.dose} — for {m.reason}
                <span className="block text-xs text-gray-400">
                  Added by {v.provider.name} on {fmt(v.date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
