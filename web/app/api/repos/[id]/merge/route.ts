// POST /api/repos/[id]/merge — the merge-conflict demo flow. Three actions:
//   { action: "simulate" } -> branch the repo twice, two providers edit the SAME
//                             plan file differently. Returns { ours, theirs, filepath }.
//   { action: "detect", ours, theirs } -> 3-way diff vs merge-base. Returns
//                             { conflicts: MergeConflict[] }.
//   { action: "resolve", ours, theirs, resolutions: [{filepath, content}] } ->
//                             write a real MERGE commit + fast-forward main.
//                             Returns { ok, oid }.
//
// Requires WRITE access to the repo (owner patient or a write-granted provider),
// since resolving creates real commits. SYNTHETIC data only.

import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo } from "@/lib/hub/store";
import { detectConflicts, resolveMerge, simulateConcurrentEdit } from "@/lib/hub/merge";

export const runtime = "nodejs";

type Body =
  | { action: "simulate" }
  | { action: "detect"; ours?: string; theirs?: string }
  | { action: "resolve"; ours?: string; theirs?: string; resolutions?: { filepath: string; content: string }[] };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!getRepo(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "write")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "simulate") {
      const branches = await simulateConcurrentEdit(id);
      const conflicts = await detectConflicts(id, branches.ours, branches.theirs);
      return Response.json({ ok: true, ...branches, conflicts });
    }

    if (body.action === "detect") {
      const ours = body.ours?.trim();
      const theirs = body.theirs?.trim();
      if (!ours || !theirs) {
        return Response.json({ error: "ours and theirs branch names required" }, { status: 400 });
      }
      const conflicts = await detectConflicts(id, ours, theirs);
      return Response.json({ ok: true, conflicts });
    }

    if (body.action === "resolve") {
      const ours = body.ours?.trim();
      const theirs = body.theirs?.trim();
      const resolutions = Array.isArray(body.resolutions) ? body.resolutions : [];
      if (!ours || !theirs) {
        return Response.json({ error: "ours and theirs branch names required" }, { status: 400 });
      }
      if (resolutions.length === 0) {
        return Response.json({ error: "resolutions required" }, { status: 400 });
      }
      const oid = await resolveMerge(id, ours, theirs, resolutions);
      return Response.json({ ok: true, oid });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: "merge action failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
