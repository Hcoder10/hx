// GET /api/repos/[id]/export?file=medications|problems|allergies — download the
// repo's record as markdown. With ?file=, returns that single section file as an
// attachment; without it, concatenates all sections into one "<repoName>.md"
// bundle. Read access required. SYNTHETIC data only.

import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo } from "@/lib/hub/store";
import { ensureRepoBuilt, listVisitFiles } from "@/lib/hub/repos";

export const runtime = "nodejs";

type SectionKey = "medications" | "problems" | "allergies";
const SECTIONS: SectionKey[] = ["medications", "problems", "allergies"];

function isSection(v: string | null): v is SectionKey {
  return v === "medications" || v === "problems" || v === "allergies";
}

// Sanitize a value for use inside a Content-Disposition filename.
function safeName(s: string): string {
  return (s || "record").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "record";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const repo = getRepo(id);
  if (!repo) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "read")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let files = { medications: "", problems: "", allergies: "" };
  try {
    await ensureRepoBuilt(id);
    files = await listVisitFiles(id);
  } catch {
    // best-effort; export empty sections rather than failing the download
  }

  const fileParam = new URL(req.url).searchParams.get("file");

  let body: string;
  let filename: string;

  if (isSection(fileParam)) {
    body = files[fileParam] || `# ${fileParam}\n\n_none recorded_\n`;
    filename = `${safeName(id)}-${fileParam}.md`;
  } else {
    const title = `# ${repo.name}${repo.description ? ` — ${repo.description}` : ""}`;
    const parts = [title, ""];
    for (const s of SECTIONS) {
      parts.push((files[s] || `# ${s}\n\n_none recorded_\n`).trim(), "");
    }
    body = parts.join("\n").trimEnd() + "\n";
    filename = `${safeName(repo.name)}.md`;
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
