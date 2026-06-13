import Link from "next/link";
import CallClient from "./CallClient";

export default function Call() {
  return (
    <main className="mx-auto max-w-xl space-y-6 p-4 text-center">
      <Link href="/app" className="block text-left text-sm text-teal-700">
        ← Back
      </Link>
      <h1 className="text-xl font-bold text-gray-900">Talk to Hx</h1>
      <p className="text-gray-600">
        After any visit, just say what happened — in any language. Hx adds it to your story and
        checks it against everything else.
      </p>
      <CallClient />
    </main>
  );
}
