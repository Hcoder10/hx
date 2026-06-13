import Link from "next/link";
import { notFound } from "next/navigation";
import { getAlert } from "@/lib/hx";

export const dynamic = "force-dynamic";

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAlert(id);
  if (!a) notFound();

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <Link href="/app" className="text-sm text-teal-700">
        ← Back
      </Link>

      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="text-lg font-bold text-red-700">⚠️ {a.title}</div>
        <p className="mt-1 text-red-900">{a.explanation}</p>
      </div>

      <div className="rounded-2xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900">The two medicines</h2>
        <ul className="mt-1 space-y-1 text-sm text-gray-700">
          {a.involved.map((m, i) => (
            <li key={i}>
              💊 {m.name}
              <span className="block text-xs text-gray-400">
                Added by {m.provider} on {fmt(m.date)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-gray-200 p-4">
        <h2 className="font-semibold text-gray-900">What to do</h2>
        <ul className="mt-1 list-disc pl-5 text-sm text-gray-700">
          {a.whatToDo.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        {a.script ? (
          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <div className="text-xs font-semibold uppercase text-gray-400">What you can say</div>
            “{a.script}”
          </div>
        ) : null}
      </div>
    </main>
  );
}
