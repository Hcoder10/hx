import Link from "next/link";
import { getTimeline, getAlerts } from "@/lib/hx";

export const dynamic = "force-dynamic";

function fmt(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Timeline() {
  const visits = getTimeline();
  const alerts = getAlerts();

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-gray-900">Your health story</h1>
        <Link href="/app/repo" className="text-xs text-gray-400 hover:text-gray-600">
          under the hood ↗
        </Link>
      </header>

      {alerts.map((a) => (
        <Link
          key={a.id}
          href={`/app/alert/${a.id}`}
          className="block rounded-2xl border border-red-200 bg-red-50 p-4"
        >
          <div className="font-semibold text-red-700">⚠️ Heads-up about your medicines</div>
          <p className="mt-1 text-sm text-red-800">{a.summary} Tap to see what to do.</p>
        </Link>
      ))}

      <Link
        href="/app/call"
        className="block rounded-2xl bg-teal-600 p-4 text-center font-semibold text-white hover:bg-teal-700"
      >
        ＋ Add a visit (call Hx)
      </Link>

      <Link
        href="/app/next-appointment"
        className="block rounded-2xl border border-teal-200 bg-white p-4 hover:border-teal-400"
      >
        <div className="font-semibold text-gray-900">🔎 Find your next appointment</div>
        <p className="text-sm text-gray-600">See which care option works best for someone like you.</p>
      </Link>

      <ul className="space-y-3">
        {visits.map((v) => (
          <li key={v.id}>
            <Link
              href={`/app/visit/${v.id}`}
              className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-teal-300"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{v.title}</span>
                <span className="text-xs text-gray-400">{fmt(v.date)}</span>
              </div>
              <div className="text-sm text-gray-500">
                {v.place} · {v.provider.name}
              </div>
              <p className="mt-1 text-sm text-gray-600">{v.summary}</p>
            </Link>
          </li>
        ))}
      </ul>

      <nav className="flex gap-4 pt-2 text-sm text-teal-700">
        <Link href="/app/medications">Medicines</Link>
        <Link href="/app/next-appointment">Find care</Link>
        <Link href="/app/validate">Data check</Link>
      </nav>
    </main>
  );
}
