import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo, getUser, listReposByOwner } from "@/lib/hub/store";
import { allMedicationsForOwner, getLog } from "@/lib/hub/repos";
import { checkConflicts } from "@/lib/hx/conflicts";
import { voiceModel } from "@/lib/hx/voice";
import {
  buildAgentInstructions,
  toolsForRole,
  type VoiceContext,
  type VoiceRole,
} from "@/lib/hx/voice-agents";

export const runtime = "nodejs";

// Mints an ephemeral realtime token AND returns role-aware grounding: the patient
// agent (warm check-ins + PHQ-9/GAD-7) or the provider agent (dictate assessment /
// prescribe / commit). The browser never sees the raw API key.
export async function GET(req: Request) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.XAI_API_KEY;
  if (!key) return Response.json({ error: "XAI_API_KEY not set" }, { status: 500 });

  const url = new URL(req.url);
  const role = (url.searchParams.get("role") as VoiceRole) || session.role;
  let repoId = url.searchParams.get("repoId") || "";
  const demoShort = url.searchParams.get("short") !== "0"; // short-form PHQ-9 by default (3-min demo)

  // Resolve the working repo + the patient whose record we're in.
  let ownerId: string;
  if (role === "provider") {
    if (!repoId || !getRepo(repoId)) return Response.json({ error: "repoId required for provider" }, { status: 400 });
    if (!canAccess(session.userId, repoId, "read")) return Response.json({ error: "forbidden" }, { status: 403 });
    ownerId = getRepo(repoId)!.ownerId;
  } else {
    // patient: default to their mental-health thread, else first owned repo.
    ownerId = session.userId;
    if (!repoId) {
      const mine = listReposByOwner(ownerId);
      repoId = (mine.find((r) => r.id === "mental-health") || mine[0])?.id || "";
    }
  }
  const repo = repoId ? getRepo(repoId) : undefined;
  const patient = getUser(ownerId);
  const me = getUser(session.userId);

  // Grounding: cross-provider med list + interaction alerts + recent visits.
  let meds: Awaited<ReturnType<typeof allMedicationsForOwner>> = [];
  try {
    meds = await allMedicationsForOwner(ownerId);
  } catch {}
  const alerts = checkConflicts(meds);
  let recentVisits: { title: string; date: string; author: string }[] = [];
  try {
    if (repoId) {
      const log = await getLog(repoId);
      recentVisits = log.slice(0, 5).map((c) => ({ title: c.message, date: c.date.slice(0, 10), author: c.authorName }));
    }
  } catch {}

  const ctx: VoiceContext = {
    role,
    patientName: patient?.displayName || "the patient",
    providerName: role === "provider" ? me?.displayName : undefined,
    providerRole: role === "provider" ? me?.providerRole : undefined,
    repoId,
    repoName: repo?.name || "your record",
    meds: meds.map((m) => ({ name: m.name, dose: m.dose, reason: m.reason, providerName: m.providerName, date: m.date })),
    alerts: alerts.map((a) => ({ title: a.title, explanation: a.explanation })),
    recentVisits,
    assessments: [],
  };

  const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expires_after: { seconds: 600 } }),
  });
  if (!r.ok) {
    const detail = await r.text();
    return Response.json({ error: "token mint failed", detail }, { status: 502 });
  }
  const data = await r.json();
  return Response.json({
    token: data.value,
    model: voiceModel(),
    role,
    repoId,
    repoName: ctx.repoName,
    instructions: buildAgentInstructions(ctx, { demoShort }),
    tools: toolsForRole(role),
    voice: role === "provider" ? "rex" : "eve",
  });
}
