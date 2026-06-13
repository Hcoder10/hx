import git from "isomorphic-git";
import fs from "fs";
import path from "path";
import os from "os";
import { Encounter, Provider } from "./model";
import { encounters as seedEncounters, providers as seedProviders } from "./seed-data";
import { allEncounters } from "./store";

// The record is a REAL git repo, built deterministically into a writable dir
// (works locally and on Vercel via the OS temp dir). Added visits append commits.
const DATA_DIR = process.env.HX_DATA_DIR || path.join(os.tmpdir(), "hx-data");
const REPO_DIR = path.join(DATA_DIR, "maria");

let seedPromise: Promise<string> | null = null;

export function repoDir() {
  return REPO_DIR;
}

export function ensureSeeded(): Promise<string> {
  if (!seedPromise) seedPromise = build();
  return seedPromise;
}

function section(title: string, lines: string[]): string {
  return `# ${title}\n\n${lines.length ? lines.join("\n") : "_none recorded_"}\n`;
}

function encounterMd(e: Encounter, p?: Provider): string {
  const notes = (e.notes ?? []).map((n) => `- ${n}`).join("\n");
  const who = p ? `${p.name}${p.role ? ` (${p.role}${p.org ? `, ${p.org}` : ""})` : ""}` : "Unknown";
  return `# ${e.title}\n\n- Date: ${e.date}\n- Place: ${e.place}\n- Provider: ${who}\n\n${e.summary}\n\n${notes}\n`;
}

async function writeRepoFile(relPosix: string, content: string) {
  const abs = path.join(REPO_DIR, ...relPosix.split("/"));
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, content, "utf8");
}

function cumulative(ordered: Encounter[]) {
  const meds: string[] = [];
  const problems: string[] = [];
  const allergies: string[] = [];
  for (const x of ordered) {
    (x.addProblems ?? []).forEach((p) => problems.push(`- ${p.name}`));
    (x.addMedications ?? []).forEach((m) => meds.push(`- ${m.name} ${m.dose} — for ${m.reason}`));
    (x.addAllergies ?? []).forEach((a) => allergies.push(`- ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`));
  }
  return { meds, problems, allergies };
}

async function commitOne(e: Encounter, provider: Provider | undefined, orderedSoFar: Encounter[]) {
  const { meds, problems, allergies } = cumulative(orderedSoFar);
  const files: [string, string][] = [
    ["medications.md", section("Medications", meds)],
    ["problems.md", section("Problems", problems)],
    ["allergies.md", section("Allergies", allergies)],
    [`encounters/${e.id}.md`, encounterMd(e, provider)],
  ];
  for (const [rel, content] of files) {
    await writeRepoFile(rel, content);
    await git.add({ fs, dir: REPO_DIR, filepath: rel });
  }
  const timestamp = Math.floor(new Date(e.date + "T12:00:00Z").getTime() / 1000);
  await git.commit({
    fs,
    dir: REPO_DIR,
    message: `${e.title} — ${e.place}`,
    author: {
      name: provider?.name ?? "Unknown",
      email: provider?.email ?? "unknown@hx.local",
      timestamp,
      timezoneOffset: 0,
    },
  });
}

async function build(): Promise<string> {
  await fs.promises.rm(REPO_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(REPO_DIR, { recursive: true });
  await git.init({ fs, dir: REPO_DIR, defaultBranch: "main" });

  const ordered = [...seedEncounters].sort((a, b) => a.date.localeCompare(b.date));
  const acc: Encounter[] = [];
  for (const e of ordered) {
    acc.push(e);
    await commitOne(e, seedProviders[e.providerId], acc);
  }
  return REPO_DIR;
}

// Append a new visit as a real commit (used when a visit is added at runtime).
export async function commitEncounter(e: Encounter, provider: Provider | undefined): Promise<void> {
  await ensureSeeded();
  const ordered = [...allEncounters()].sort((a, b) => a.date.localeCompare(b.date));
  await commitOne(e, provider, ordered);
}

export type RepoCommit = { oid: string; message: string; author: string; date: string };

export async function getLog(): Promise<RepoCommit[]> {
  await ensureSeeded();
  const log = await git.log({ fs, dir: REPO_DIR });
  return log.map((c) => ({
    oid: c.oid.slice(0, 7),
    message: c.commit.message.trim(),
    author: c.commit.author.name,
    date: new Date(c.commit.author.timestamp * 1000).toISOString().slice(0, 10),
  }));
}
