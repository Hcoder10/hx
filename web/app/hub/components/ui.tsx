"use client";

// Small shared presentational components for the Hub UI. Warm, plain-language,
// mobile-first. Kept tiny + dependency-free (just Tailwind).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, type MeUser } from "../lib";

// A soft card container.
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>
  );
}

// Primary / secondary / danger buttons sharing a base style.
export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<string, string> = {
    primary: "bg-teal-600 text-white hover:bg-teal-700",
    secondary: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    ghost: "text-teal-700 hover:bg-teal-50",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

// The git "reveal" pill: a monospace short oid that whispers "this is real git".
export function OidPill({ oid, short }: { oid: string; short?: string }) {
  return (
    <span
      title={`commit ${oid}`}
      className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-500"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="opacity-60" aria-hidden>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2v7M12 15v7" stroke="currentColor" strokeWidth="2" />
      </svg>
      {short ?? oid.slice(0, 7)}
    </span>
  );
}

// Access-level badge.
export function AccessBadge({ access }: { access: "read" | "write" }) {
  return access === "write" ? (
    <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">Can add visits</span>
  ) : (
    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Read only</span>
  );
}

// Top bar with the Hx wordmark, an optional "you are signed in as" + sign out.
export function HubHeader({ me }: { me?: MeUser | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
    } catch {
      // ignore — clear locally regardless
    }
    router.push("/hub");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href={me ? (me.role === "provider" ? "/hub/provider" : "/hub/patient") : "/hub"} className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight text-teal-700">Hx</span>
          <span className="hidden text-sm text-gray-400 sm:inline">your health, version-controlled</span>
        </Link>
        {me ? (
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium text-gray-800">{me.displayName}</div>
              <div className="text-xs text-gray-400">{me.role === "provider" ? me.org || "Provider" : "Patient"}</div>
            </div>
            <Button variant="secondary" onClick={signOut} disabled={busy}>
              Sign out
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

// Full-page centered loading / error states.
export function CenterState({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-24 text-center text-gray-500">{children}</div>;
}

// A small spinner.
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-gray-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}

// Plain-language demo banner shown across the hub.
export function SyntheticBanner() {
  return (
    <p className="px-1 pt-4 text-center text-xs text-gray-400">
      Demo · synthetic data only · no real patient information
    </p>
  );
}
