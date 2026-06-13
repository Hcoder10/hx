import Link from "next/link";
import { getRepoLog } from "@/lib/hx";

export const dynamic = "force-dynamic";

export default async function Repo() {
  const log = await getRepoLog();

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/app" className="text-sm text-teal-700">
        ← Back
      </Link>
      <h1 className="text-xl font-bold text-gray-900">Under the hood: it’s a real git repo</h1>
      <p className="text-sm text-gray-600">
        Every visit is a real commit, authored by the provider who made it. This is genuine version
        control — the warm app never shows it.
      </p>
      <pre className="overflow-x-auto rounded-2xl bg-gray-900 p-4 text-xs leading-relaxed text-green-300">
        {log
          .map((c) => `${c.oid}  ${c.date}  ${c.author.padEnd(18)}  ${c.message}`)
          .join("\n")}
      </pre>
    </main>
  );
}
