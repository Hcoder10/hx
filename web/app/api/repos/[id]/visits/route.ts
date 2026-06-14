import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo } from "@/lib/hub/store";
import { commitVisit, editVisit, ensureRepoBuilt, getLog } from "@/lib/hub/repos";
import type { Visit } from "@/lib/hub/model";

export const runtime = "nodejs";

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Shape of an incoming visit. EVERYTHING is optional so the UI can make small,
// focused commits — e.g. just a lab note, or just newly reported symptoms.
type VisitInput = {
  visitId?: string; // PATCH only: which existing visit to edit
  title?: string;
  place?: string;
  summary?: string;
  date?: string;
  notes?: string[];
  addMedications?: Visit["addMedications"];
  addProblems?: Visit["addProblems"];
  addAllergies?: Visit["addAllergies"];
};

// Build a partial Visit from the request body. Only includes keys the caller sent
// so that a small commit doesn't blow away other fields.
function visitPatchFromBody(body: VisitInput): Partial<Visit> {
  const patch: Partial<Visit> = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.place === "string") patch.place = body.place;
  if (typeof body.summary === "string") patch.summary = body.summary;
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) patch.date = body.date;
  if (Array.isArray(body.notes)) patch.notes = body.notes;
  if (Array.isArray(body.addMedications)) patch.addMedications = body.addMedications;
  if (Array.isArray(body.addProblems)) patch.addProblems = body.addProblems;
  if (Array.isArray(body.addAllergies)) patch.addAllergies = body.addAllergies;
  return patch;
}

// GET /api/repos/[id]/visits -> the commit log (visits) for the repo (read access).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!getRepo(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "read")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let log: Awaited<ReturnType<typeof getLog>> = [];
  try {
    await ensureRepoBuilt(id);
    log = await getLog(id);
  } catch {
    // best-effort
  }
  return Response.json({ visits: log });
}

// POST /api/repos/[id]/visits -> append a new visit as a commit (write access).
// All visit fields optional so small commits work; date defaults to today.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!getRepo(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "write")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: VisitInput;
  try {
    body = (await req.json()) as VisitInput;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "2026-06-13";
  const title = body.title?.trim() || "Visit update";
  const visit: Visit = {
    id: `${date}-${slug(title)}`,
    date,
    authorId: session.userId,
    title,
    place: body.place?.trim() || "",
    summary: body.summary?.trim() || "",
    notes: Array.isArray(body.notes) ? body.notes : undefined,
    addMedications: Array.isArray(body.addMedications) ? body.addMedications : undefined,
    addProblems: Array.isArray(body.addProblems) ? body.addProblems : undefined,
    addAllergies: Array.isArray(body.addAllergies) ? body.addAllergies : undefined,
  };

  try {
    await ensureRepoBuilt(id);
    await commitVisit(id, visit);
  } catch (e) {
    return Response.json(
      { error: "commit failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, visit }, { status: 201 });
}

// PATCH /api/repos/[id]/visits -> edit an existing visit (write access).
// Body must include visitId; remaining fields are an optional partial.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!getRepo(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "write")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let body: VisitInput;
  try {
    body = (await req.json()) as VisitInput;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const visitId = body.visitId?.trim();
  if (!visitId) return Response.json({ error: "visitId required" }, { status: 400 });

  // editVisit requires authorId on the patch; set it from the session.
  const patch: Partial<Visit> & { authorId: string } = {
    ...visitPatchFromBody(body),
    authorId: session.userId,
  };

  try {
    await ensureRepoBuilt(id);
    await editVisit(id, visitId, patch);
  } catch (e) {
    return Response.json(
      { error: "edit failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, visitId });
}
