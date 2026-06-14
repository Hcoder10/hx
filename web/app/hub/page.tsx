"use client";

// Hub landing: pick patient or provider, then register or sign in with a PASSKEY
// (WebAuthn via @simplewebauthn/browser). A "Use a demo account" section calls
// /api/auth/dev-login so judges get in instantly. On success, route by role.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { api, type MeUser, type Role } from "./lib";
import { Button, Card, SyntheticBanner } from "./components/ui";

type Mode = "choose" | "form";
type AuthAction = "register" | "signin";

const DEMO_ACCOUNTS: { username: string; label: string; sub: string; role: Role }[] = [
  { username: "maria@hx.demo", label: "Maria Reyes", sub: "Patient — owns 3 visit threads", role: "patient" },
  { username: "dr.okafor@bayview.example", label: "Dr. Okafor", sub: "Psychiatry · Bayview Behavioral Health", role: "provider" },
  { username: "dr.chen@eastsidefm.example", label: "Dr. Chen", sub: "Primary Care · Eastside Family Medicine", role: "provider" },
  { username: "records@mercygeneral.example", label: "Mercy General ER", sub: "Emergency · Mercy General Hospital", role: "provider" },
];

function routeFor(role: Role): string {
  return role === "provider" ? "/hub/provider" : "/hub/patient";
}

export default function HubLanding() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<Role>("patient");
  const [mode, setMode] = useState<Mode>("choose");
  const [action, setAction] = useState<AuthAction>("register");

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [org, setOrg] = useState("");
  const [providerRole, setProviderRole] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in, bounce straight to the dashboard.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user } = await api<{ user: MeUser }>("/api/auth/me");
        if (alive && user) router.replace(routeFor(user.role));
      } catch {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  async function go(user: { role: Role }) {
    router.push(routeFor(user.role));
    router.refresh();
  }

  async function handlePasskey() {
    setError(null);
    const uname = username.trim();
    if (!uname) {
      setError("Please enter an email or username.");
      return;
    }
    setBusy(true);
    try {
      if (action === "register") {
        const options = await api<PublicKeyCredentialCreationOptionsJSON>("/api/auth/register/options", {
          method: "POST",
          body: JSON.stringify({
            username: uname,
            displayName: displayName.trim() || uname,
            role,
            org: role === "provider" ? org.trim() || undefined : undefined,
            providerRole: role === "provider" ? providerRole.trim() || undefined : undefined,
          }),
        });
        const attResp = await startRegistration({ optionsJSON: options });
        const { user } = await api<{ ok: true; user: { id: string; role: Role; displayName: string } }>(
          "/api/auth/register/verify",
          { method: "POST", body: JSON.stringify({ username: uname, response: attResp }) },
        );
        await go(user);
      } else {
        const options = await api<PublicKeyCredentialRequestOptionsJSON>("/api/auth/login/options", {
          method: "POST",
          body: JSON.stringify({ username: uname }),
        });
        const asseResp = await startAuthentication({ optionsJSON: options });
        const { user } = await api<{ ok: true; user: { id: string; role: Role; displayName: string } }>(
          "/api/auth/login/verify",
          { method: "POST", body: JSON.stringify({ username: uname, response: asseResp }) },
        );
        await go(user);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      // Friendlier message for the common "no passkey on this device" case.
      if (action === "signin" && /no pending|not verified|not found|abort/i.test(msg)) {
        setError("Couldn't sign in with a passkey for that account. Try registering, or use a demo account below.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin(usernameToUse: string) {
    setError(null);
    setBusy(true);
    try {
      const { user } = await api<{ ok: true; user: { id: string; role: Role } }>("/api/auth/dev-login", {
        method: "POST",
        body: JSON.stringify({ username: usernameToUse }),
      });
      await go(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo sign-in failed.");
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-teal-50 to-white">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 to-white">
      <div className="mx-auto max-w-md px-5 py-10">
        <div className="space-y-2 text-center">
          <div className="text-4xl font-bold tracking-tight text-teal-700">Hx</div>
          <h1 className="text-xl font-semibold text-gray-900">Your whole health story, in one place — that you own.</h1>
          <p className="text-sm text-gray-600">
            Every visit is a saved version of your record. You decide which doctor sees which thread.
          </p>
        </div>

        {/* Role chooser */}
        <Card className="mt-7">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setRole("patient")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                role === "patient" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"
              }`}
            >
              I&apos;m a patient
            </button>
            <button
              onClick={() => setRole("provider")}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                role === "provider" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"
              }`}
            >
              I&apos;m a provider
            </button>
          </div>

          {mode === "choose" ? (
            <div className="mt-5 space-y-3">
              <p className="text-center text-sm text-gray-600">
                {role === "patient"
                  ? "Create your record or sign back in — secured with a passkey (Face ID / fingerprint). No passwords."
                  : "Access the threads patients have shared with you — secured with a passkey. No passwords."}
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  setAction("register");
                  setMode("form");
                  setError(null);
                }}
              >
                Create an account with a passkey
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setAction("signin");
                  setMode("form");
                  setError(null);
                }}
              >
                Sign in with a passkey
              </Button>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  {role === "provider" ? "Work email" : "Email or username"}
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={role === "provider" ? "you@clinic.example" : "you@example.com"}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  autoComplete="username"
                />
              </div>

              {action === "register" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">Your name</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={role === "provider" ? "Dr. Smith" : "Your name"}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  {role === "provider" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={org}
                        onChange={(e) => setOrg(e.target.value)}
                        placeholder="Organization"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <input
                        value={providerRole}
                        onChange={(e) => setProviderRole(e.target.value)}
                        placeholder="Specialty"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  )}
                </>
              )}

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              <Button className="w-full" onClick={handlePasskey} disabled={busy}>
                {busy
                  ? "Waiting for your device…"
                  : action === "register"
                    ? "Create passkey & continue"
                    : "Continue with passkey"}
              </Button>
              <button
                onClick={() => {
                  setMode("choose");
                  setError(null);
                }}
                className="block w-full text-center text-xs text-gray-400 hover:text-gray-600"
              >
                ← Back
              </button>
            </div>
          )}
        </Card>

        {/* Demo accounts */}
        <Card className="mt-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">Use a demo account</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">judges</span>
          </div>
          <p className="mb-3 text-xs text-gray-500">Instant sign-in, no passkey needed. Try Maria, then a provider.</p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.username}
                onClick={() => demoLogin(acc.username)}
                disabled={busy}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5 text-left transition hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-medium text-gray-800">{acc.label}</span>
                  <span className="block text-xs text-gray-500">{acc.sub}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    acc.role === "patient" ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {acc.role}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <SyntheticBanner />
      </div>
    </main>
  );
}
