import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-teal-50 to-white p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="text-5xl font-bold tracking-tight text-teal-700">Hx</div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Your whole health story, in one place — that you own.
        </h1>
        <p className="text-gray-600">
          Every visit, every medicine, every doctor, together at last. Hx watches for problems no
          single doctor can see.
        </p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <input
          type="tel"
          placeholder="Your phone number"
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center"
        />
        <Link
          href="/app"
          className="block w-full rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-700"
        >
          Continue with Face ID
        </Link>
        <p className="text-xs text-gray-400">Demo · synthetic data only · no real patient information</p>
      </div>
      <div className="w-full max-w-xs">
        <Link
          href="/hub"
          className="block w-full rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
        >
          Open the Hub — sign in with a passkey →
        </Link>
      </div>
    </main>
  );
}
