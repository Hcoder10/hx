// GET /api/repos/[id]/coded — code the repo's CURRENT record with the real
// validation pipeline (chunk -> retrieve -> Grok format -> deterministic verify).
//
// We read the cumulative section files at HEAD (medications.md / problems.md /
// allergies.md), parse their markdown lines back into a minimal Encounter, and
// run validateRecord() over it. The verifier (not the model) decides accepted.
// Read access required. SYNTHETIC data only.

import { getSession } from "@/lib/auth/session";
import { canAccess } from "@/lib/hub/access";
import { ensureSeededMetadata, getRepo } from "@/lib/hub/store";
import { ensureRepoBuilt, listVisitFiles } from "@/lib/hub/repos";
import { validateRecord } from "@/lib/validation";
import { formatWithGrok } from "@/lib/hx/grok";
import type { Encounter } from "@/lib/hx";

export const runtime = "nodejs";

// Pull the bullet content out of a markdown section, skipping the "# Title"
// heading, blank lines, and the "_none recorded_" placeholder.
function bulletLines(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0 && l.toLowerCase() !== "_none recorded_");
}

// "lisinopril 10 mg — for high blood pressure" -> { name, dose, reason }
// Tolerant of em-dash or hyphen separators and a missing dose/reason.
function parseMed(line: string): { name: string; dose: string; reason: string } {
  // Split off the reason after an em-dash / "—" / " - " separator.
  const sep = line.search(/\s[—–-]\s/);
  let head = line;
  let reason = "";
  if (sep !== -1) {
    head = line.slice(0, sep).trim();
    reason = line
      .slice(sep)
      .replace(/^\s[—–-]\s*/, "")
      .replace(/^for\s+/i, "")
      .trim();
  }
  // From the head, split name vs dose at the first number (e.g. "10 mg").
  const doseMatch = head.match(/\s\d.*$/);
  let name = head;
  let dose = "";
  if (doseMatch && doseMatch.index !== undefined) {
    name = head.slice(0, doseMatch.index).trim();
    dose = head.slice(doseMatch.index).trim();
  }
  return { name: name || head, dose, reason };
}

// "Penicillin (rash)" -> { substance, reaction }
function parseAllergy(line: string): { substance: string; reaction?: string } {
  const m = line.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (m) return { substance: m[1].trim(), reaction: m[2].trim() || undefined };
  return { substance: line };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureSeededMetadata();
  const session = getSession(req);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!getRepo(id)) return Response.json({ error: "not found" }, { status: 404 });
  if (!canAccess(session.userId, id, "read")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let files = { medications: "", problems: "", allergies: "" };
  try {
    await ensureRepoBuilt(id);
    files = await listVisitFiles(id);
  } catch {
    // best-effort; an empty record codes to zero entries
  }

  const enc: Encounter = {
    id: "coded",
    date: "2026-06-13",
    providerId: "er",
    title: "current record",
    place: "",
    summary: "",
    addProblems: bulletLines(files.problems).map((name) => ({ name })),
    addMedications: bulletLines(files.medications).map(parseMed),
    addAllergies: bulletLines(files.allergies).map(parseAllergy),
  };

  let entries: {
    section: string;
    system: string;
    code: string;
    term: string;
    matchedDescription?: string;
    accepted: boolean;
  }[] = [];
  try {
    const { results } = await validateRecord(enc, formatWithGrok);
    entries = results.map((r) => ({
      section: r.section,
      system: r.system,
      code: r.code,
      term: r.term,
      matchedDescription: r.matchedDescription,
      accepted: r.accepted,
    }));
  } catch {
    // pipeline failure (e.g. no model key) -> empty coding, never a 500
  }

  return Response.json({ entries });
}
