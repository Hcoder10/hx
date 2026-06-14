import git from "isomorphic-git";
import fs from "fs";
import path from "path";
import { Visit, VisitCommit, User } from "./model";
import { SEED_VISITS } from "./seed";
import { REPOS_ROOT, ensureSeededMetadata, getUser } from "./store";

// Multi-repo git manager for the Hub. Each patient repo is a REAL git repo on
// disk under <DATA_DIR>/repos/<repoId>. Each visit (encounter) is one commit,
// authored by the provider who recorded it. Mirrors lib/hx/repo.ts but:
//   - keyed per repoId (Maria owns several threads)
//   - PERSISTENT: an existing repo is never rebuilt / rm -rf'd, so runtime
//     commits survive process restarts (Railway mounted volume).
//
// To support cross-repo medication aggregation (and to re-derive visit content
// without re-parsing markdown), every commit also writes a committed visits.json
// holding the full ordered Visit[] for that repo. SYNTHETIC data only.

export function repoPath(repoId: string): string {
  return path.join(REPOS_ROOT, repoId);
}

// A medication entry enriched with where/when/who it came from. Suitable input
// for the drug-interaction engine, which needs the substance plus provenance.
export type MedWithProvenance = {
  name: string;
  dose: string;
  reason: string;
  providerName: string;
  providerRole: string;
  date: string;
  repoId: string;
  repoName: string;
};

// ---- markdown rendering (mirrors lib/hx/repo.ts) --------------------------
function section(title: string, lines: string[]): string {
  return `# ${title}\n\n${lines.length ? lines.join("\n") : "_none recorded_"}\n`;
}

function visitMd(v: Visit, author?: User): string {
  const notes = (v.notes ?? []).map((n) => `- ${n}`).join("\n");
  const who = author
    ? `${author.displayName}${author.providerRole ? ` (${author.providerRole}${author.org ? `, ${author.org}` : ""})` : ""}`
    : "Unknown";
  const meds = (v.addMedications ?? []).map((m) => `- ${m.name} ${m.dose} — for ${m.reason}`).join("\n");
  const problems = (v.addProblems ?? []).map((p) => `- ${p.name}`).join("\n");
  const allergies = (v.addAllergies ?? []).map((a) => `- ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join("\n");
  const blocks: string[] = [
    `# ${v.title}`,
    `- Date: ${v.date}\n- Place: ${v.place}\n- Provider: ${who}`,
    v.summary,
  ];
  if (notes) blocks.push(`## Notes\n\n${notes}`);
  if (meds) blocks.push(`## Medications added\n\n${meds}`);
  if (problems) blocks.push(`## Problems added\n\n${problems}`);
  if (allergies) blocks.push(`## Allergies added\n\n${allergies}`);
  return blocks.join("\n\n") + "\n";
}

function cumulative(ordered: Visit[]) {
  const meds: string[] = [];
  const problems: string[] = [];
  const allergies: string[] = [];
  for (const v of ordered) {
    (v.addProblems ?? []).forEach((p) => problems.push(`- ${p.name}`));
    (v.addMedications ?? []).forEach((m) => meds.push(`- ${m.name} ${m.dose} — for ${m.reason}`));
    (v.addAllergies ?? []).forEach((a) => allergies.push(`- ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`));
  }
  return { meds, problems, allergies };
}

// ---- low-level fs helpers -------------------------------------------------
async function writeRepoFile(repoId: string, relPosix: string, content: string) {
  const abs = path.join(repoPath(repoId), ...relPosix.split("/"));
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, content, "utf8");
}

function dateToTimestamp(date: string): number {
  return Math.floor(new Date(date + "T12:00:00Z").getTime() / 1000);
}

// The committed visits.json is the source of truth for visit content (so it can
// be re-read for aggregation regardless of process restarts).
async function readVisits(repoId: string): Promise<Visit[]> {
  const abs = path.join(repoPath(repoId), "visits.json");
  try {
    const raw = await fs.promises.readFile(abs, "utf8");
    return JSON.parse(raw) as Visit[];
  } catch {
    return [];
  }
}

function sortVisits(visits: Visit[]): Visit[] {
  return [...visits].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
}

// Stage the full repo state for a given ordered visit list, then write+add the
// section files, the per-encounter file for `focus`, and visits.json.
async function stageState(repoId: string, ordered: Visit[], focus: Visit) {
  const { meds, problems, allergies } = cumulative(ordered);
  const files: [string, string][] = [
    ["medications.md", section("Medications", meds)],
    ["problems.md", section("Problems", problems)],
    ["allergies.md", section("Allergies", allergies)],
    [`encounters/${focus.id}.md`, visitMd(focus, getUser(focus.authorId))],
    ["visits.json", JSON.stringify(ordered, null, 2) + "\n"],
  ];
  for (const [rel, content] of files) {
    await writeRepoFile(repoId, rel, content);
    await git.add({ fs, dir: repoPath(repoId), filepath: rel });
  }
}

// ---- public API -----------------------------------------------------------

// Build the repo from seed visits if it does not yet exist. If it already has a
// .git dir, do nothing (persistence — never clobber runtime commits).
export async function ensureRepoBuilt(repoId: string): Promise<void> {
  ensureSeededMetadata();
  const dir = repoPath(repoId);
  const gitDir = path.join(dir, ".git");
  if (fs.existsSync(gitDir)) return; // already built — keep its history

  await fs.promises.mkdir(dir, { recursive: true });
  await git.init({ fs, dir, defaultBranch: "main" });

  const ordered = sortVisits(SEED_VISITS[repoId] ?? []);
  const acc: Visit[] = [];
  for (const v of ordered) {
    acc.push(v);
    await stageState(repoId, [...acc], v);
    const author = getUser(v.authorId);
    await git.commit({
      fs,
      dir,
      message: `${v.title} — ${v.place}`,
      author: {
        name: author?.displayName ?? "Unknown",
        email: author?.email ?? "unknown@hx.local",
        timestamp: dateToTimestamp(v.date),
        timezoneOffset: 0,
      },
    });
  }
}

// Commit a NEW visit into a repo. The visit may be minimal (e.g. only notes, or
// a single med, or just a lab result in the summary) — all content arrays are
// optional and handled gracefully. Returns the new commit oid.
export async function commitVisit(repoId: string, visit: Visit): Promise<string> {
  await ensureRepoBuilt(repoId);
  const dir = repoPath(repoId);

  const existing = await readVisits(repoId);
  const ordered = sortVisits([...existing.filter((v) => v.id !== visit.id), visit]);
  await stageState(repoId, ordered, visit);

  const author = getUser(visit.authorId);
  const oid = await git.commit({
    fs,
    dir,
    message: `${visit.title} — ${visit.place}`,
    author: {
      name: author?.displayName ?? "Unknown",
      email: author?.email ?? "unknown@hx.local",
      timestamp: dateToTimestamp(visit.date),
      timezoneOffset: 0,
    },
  });
  return oid;
}

// Amend an existing visit. COMMITTING ALSO MEANS EDITING — git keeps the full
// history, so an edit is a brand new commit that re-writes the encounter file
// and re-aggregates the section files. Returns the new oid.
export async function editVisit(
  repoId: string,
  visitId: string,
  patch: Partial<Visit> & { authorId: string },
): Promise<string> {
  await ensureRepoBuilt(repoId);
  const dir = repoPath(repoId);

  const existing = await readVisits(repoId);
  const prior = existing.find((v) => v.id === visitId);
  // Merge: arrays in the patch REPLACE prior arrays (caller passes the full new
  // value); scalars fall back to prior then sensible defaults for a fresh visit.
  const merged: Visit = {
    id: visitId,
    date: patch.date ?? prior?.date ?? new Date().toISOString().slice(0, 10),
    authorId: patch.authorId,
    title: patch.title ?? prior?.title ?? "Visit update",
    place: patch.place ?? prior?.place ?? getUser(patch.authorId)?.org ?? "Unknown",
    summary: patch.summary ?? prior?.summary ?? "",
    notes: patch.notes ?? prior?.notes,
    addMedications: patch.addMedications ?? prior?.addMedications,
    addProblems: patch.addProblems ?? prior?.addProblems,
    addAllergies: patch.addAllergies ?? prior?.addAllergies,
  };

  const ordered = sortVisits([...existing.filter((v) => v.id !== visitId), merged]);
  await stageState(repoId, ordered, merged);

  const author = getUser(patch.authorId);
  const oid = await git.commit({
    fs,
    dir,
    message: `Update ${merged.title}`,
    author: {
      name: author?.displayName ?? "Unknown",
      email: author?.email ?? "unknown@hx.local",
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: 0,
    },
  });
  return oid;
}

// The commit log for a repo, newest first, surfaced for the UI.
export async function getLog(repoId: string): Promise<VisitCommit[]> {
  await ensureRepoBuilt(repoId);
  const log = await git.log({ fs, dir: repoPath(repoId) });
  return log.map((c) => ({
    oid: c.oid,
    shortOid: c.oid.slice(0, 7),
    message: c.commit.message.trim(),
    authorName: c.commit.author.name,
    authorEmail: c.commit.author.email,
    date: new Date(c.commit.author.timestamp * 1000).toISOString(),
    parents: c.commit.parent,
    repoId,
  }));
}

// Read the cumulative section files (medications/problems/allergies) at HEAD or
// at a specific commit oid. Returns their text keyed by filename.
export async function listVisitFiles(
  repoId: string,
  oid?: string,
): Promise<{ medications: string; problems: string; allergies: string }> {
  await ensureRepoBuilt(repoId);
  const [medications, problems, allergies] = await Promise.all([
    readFileAt(repoId, "medications.md", oid),
    readFileAt(repoId, "problems.md", oid),
    readFileAt(repoId, "allergies.md", oid),
  ]);
  return {
    medications: medications ?? "",
    problems: problems ?? "",
    allergies: allergies ?? "",
  };
}

// Read one file at HEAD (or a given commit). Returns null if absent.
export async function readFileAt(repoId: string, filepath: string, oid?: string): Promise<string | null> {
  await ensureRepoBuilt(repoId);
  const dir = repoPath(repoId);
  try {
    const ref = oid ?? (await git.resolveRef({ fs, dir, ref: "HEAD" }));
    const { blob } = await git.readBlob({ fs, dir, oid: ref, filepath });
    return new TextDecoder("utf-8").decode(blob);
  } catch {
    return null;
  }
}

// Aggregate every medication across ALL repos owned by `ownerId`, each tagged
// with provenance (provider, role, repo, date). Feeds the interaction engine —
// the whole point of the Hub is one cross-provider med list. Reads committed
// visits.json per repo (covers seed + runtime-added visits).
export async function allMedicationsForOwner(ownerId: string): Promise<MedWithProvenance[]> {
  ensureSeededMetadata();
  // Import lazily to avoid a circular import (store imports seed only).
  const { listReposByOwner } = await import("./store");
  const repos = listReposByOwner(ownerId);
  const out: MedWithProvenance[] = [];

  for (const repo of repos) {
    await ensureRepoBuilt(repo.id);
    const visits = sortVisits(await readVisits(repo.id));
    for (const v of visits) {
      const author = getUser(v.authorId);
      for (const m of v.addMedications ?? []) {
        out.push({
          name: m.name,
          dose: m.dose,
          reason: m.reason,
          providerName: author?.displayName ?? "Unknown",
          providerRole: author?.providerRole ?? "",
          date: v.date,
          repoId: repo.id,
          repoName: repo.name,
        });
      }
    }
  }
  return out;
}
