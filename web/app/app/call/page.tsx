import Link from "next/link";

export default function Call() {
  return (
    <main className="mx-auto max-w-xl space-y-6 p-4 text-center">
      <Link href="/app" className="block text-left text-sm text-teal-700">
        ← Back
      </Link>
      <h1 className="text-xl font-bold text-gray-900">Talk to Hx</h1>
      <p className="text-gray-600">
        After any visit, call the Hx number and just say what happened — in any language. We’ll add
        it to your story and check it against everything else.
      </p>
      <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-teal-100 text-5xl">
        🎙️
      </div>
      <p className="text-sm text-gray-400">Voice agent wiring coming next (Grok Voice).</p>
    </main>
  );
}
