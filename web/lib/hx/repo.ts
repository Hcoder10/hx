import git from "isomorphic-git";
import fs from "fs";
import path from "path";
import os from "os";
import { providers, encounters } from "./seed-data";

// The record is a REAL git repo. Built deterministically from seed data into a
// writable dir (works locally and on Vercel via the OS temp dir).
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

function encounterMd(encId: string): string {
  const e = encounters.find((x) => x.id === encId)!;
  const p = providers[e.providerId];
  const notes = (e.notes ?? []).map((n) => `- ${n}`).join("\n");
  return (
    `# ${e.title}\n\n` +
    `- Date: ${e.date}\n- Place: ${e.place}\n- Provider: ${p.name} (${p.role}, ${p.org})\n\n` +
    `${e.summary}\n\n${notes}\n`
  );
}

async function writeRepoFile(relPosix: string, content: string) {
  const abs = path.join(REPO_DIR, ...relPosix.split("/"));
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, content, "utf8");
}

async function build(): Promise<string> {
  await fs.promises.rm(REPO_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(REPO_DIR, { recursive: true });
  await git.init({ fs, dir: REPO_DIR, defaultBranch: "main" });

  const meds: string[] = [];
  const problems: string[] = [];
  const allergies: string[] = [];

  const ordered = [...encounters].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of ordered) {
    const p = providers[e.providerId];
    (e.addProblems ?? []).forEach((x) => problems.push(`- ${x.name}`));
    (e.addMedications ?? []).forEach((m) => meds.push(`- ${m.name} ${m.dose} — for ${m.reason}`));
    (e.addAllergies ?? []).forEach((a) => allergies.push(`- ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`));

    const files: [string, string][] = [
      ["medications.md", section("Medications", meds)],
      ["problems.md", section("Problems", problems)],
      ["allergies.md", section("Allergies", allergies)],
      [`encounters/${e.id}.md`, encounterMd(e.id)],
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
      author: { name: p.name, email: p.email, timestamp, timezoneOffset: 0 },
    });
  }
  return REPO_DIR;
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
