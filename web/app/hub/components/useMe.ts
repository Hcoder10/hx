"use client";

// Small hook: load the current Hub user (GET /api/auth/me). Redirects to /hub
// when unauthenticated, and (optionally) enforces a required role. Returns the
// user once loaded so dashboards can greet by name.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type MeUser, type Role } from "../lib";

export function useMe(requireRole?: Role) {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user } = await api<{ user: MeUser }>("/api/auth/me");
        if (!alive) return;
        if (requireRole && user.role !== requireRole) {
          // Signed in as the wrong role for this page — send to the right one.
          router.replace(user.role === "provider" ? "/hub/provider" : "/hub/patient");
          return;
        }
        setMe(user);
        setLoading(false);
      } catch {
        if (alive) router.replace("/hub");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, requireRole]);

  return { me, loading };
}
