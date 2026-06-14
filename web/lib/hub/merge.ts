import git from "isomorphic-git";
import fs from "fs";
import path from "path";
import { MergeConflict } from "./model";
import { getUser } from "./store";
import { ensureRepoBuilt, readFileAt, repoPath } from "./repos";

// Git merge-conflict flow for the Hub. isomorphic-git's auto-merge is limited
// (it bails on non-trivial overlaps rather than producing <<<<<<< markers), so
// we implement a manual 3-way merge at FILE granularity: detect files changed
// on both branches relative to the merge-base, surface base/ours/theirs to the
// UI, let a human resolve, then write a real MERGE commit with two parents and
// fast-forward main to it. SYNTHETIC data only.

// The file two providers concurrently edit in the demo. A dedicated plan file
// keeps the conflict obvious and avoids fighting the cumulative section files.
const CONFLICT_FILE = "plan.md";

export type ConflictBranches = { ours: string; theirs: string; filepath: string };

function dec(blob: Uint8Array): string {
  return new TextDecoder("utf-8").decode(blob);
}
function enc(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function headOid(repoId: string): Promise<string> {
  return git.resolveRef({ fs, dir: repoPath(repoId), ref: "HEAD" });
}

async function tipOid(repoId: string, ref: string): Promise<string> {
  return git.resolveRef({ fs, dir: repoPath(repoId), ref });
}

// Author label "Name · YYYY-MM-DD" for a branch tip commit.
async function branchLabel(repoId: string, ref: string): Promise<string> {
  const dir = repoPath(repoId);
  const oid = await git.resolveRef({ fs, dir, ref });
  const { commit } = await git.readCommit({ fs, dir, oid });
  const date = new Date(commit.author.timestamp * 1000).toISOString().slice(0, 10);
  return `${commit.author.name} · ${date}`;
}

// Read a file's text at a given commit oid; "" if the file does not exist there.
async function fileAtOid(repoId: string, oid: string, filepath: string): Promise<string> {
  const dir = repoPath(repoId);
  try {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath });
    return dec(blob);
  } catch {
    return "";
  }
}

// Commit a single-file change onto a specific branch, authored by a provider,
// without disturbing HEAD/main. Uses an explicit tree built from HEAD's tree.
async function commitFileOnBranch(
  repoId: string,
  ref: string,
  filepath: string,
  content: string,
  authorId: string,
  message: string,
  date: string,
): Promise<string> {
  const dir = repoPath(repoId);
  const parentOid = await tipOid(repoId, ref);
  const { commit: parentCommit } = await git.readCommit({ fs, dir, oid: parentOid });

  // Start from the parent commit's tree, replace/insert the one file.
  const { tree } = await git.readTree({ fs, dir, oid: parentCommit.tree });
  const blobOid = await git.writeBlob({ fs, dir, blob: enc(content) });
  const next = tree.filter((e) => e.path !== filepath);
  next.push({ mode: "100644", path: filepath, oid: blobOid, type: "blob" });
  const treeOid = await git.writeTree({ fs, dir, tree: next });

  const author = getUser(authorId);
  const newOid = await git.commit({
    fs,
    dir,
    message,
    tree: treeOid,
    parent: [parentOid],
    ref,
    noUpdateBranch: false,
    author: {
      name: author?.displayName ?? "Unknown",
      email: author?.email ?? "unknown@hx.local",
      timestamp: Math.floor(new Date(date + "T12:00:00Z").getTime() / 1000),
      timezoneOffset: 0,
    },
  });
  return newOid;
}

// Create the demo conflict: from current HEAD, branch "provider-a" and
// "provider-b", each rewriting the SAME file to DIFFERENT content, each authored
// by a different provider. The branches are left unmerged. Returns the branch
// names + the conflicting filepath.
export async function simulateConcurrentEdit(repoId: string): Promise<ConflictBranches> {
  await ensureRepoBuilt(repoId);
  const dir = repoPath(repoId);
  const base = await headOid(repoId);

  const ours = "provider-a";
  const theirs = "provider-b";

  // (Re)create both branches at the current HEAD so the demo is idempotent.
  await git.branch({ fs, dir, ref: ours, object: base, force: true });
  await git.branch({ fs, dir, ref: theirs, object: base, force: true });

  // Seed a shared base version of the plan file on both tips is unnecessary —
  // the merge-base is HEAD and the file may not exist there yet, which is fine
  // (base = "" => both sides "added" it differently => still a conflict).
  const oursContent =
    "# Care plan\n\n" +
    "- Continue sertraline 100 mg daily for depression\n" +
    "- Add propranolol 20 mg for situational anxiety\n" +
    "- Recheck mood in 4 weeks\n";
  const theirsContent =
    "# Care plan\n\n" +
    "- Hold sertraline pending cardiology review\n" +
    "- Start metoprolol 25 mg for blood pressure\n" +
    "- Follow up in 2 weeks after ER discharge\n";

  await commitFileOnBranch(
    repoId,
    `refs/heads/${ours}`,
    CONFLICT_FILE,
    oursContent,
    "okafor",
    "Update care plan (psychiatry)",
    "2026-06-12",
  );
  await commitFileOnBranch(
    repoId,
    `refs/heads/${theirs}`,
    CONFLICT_FILE,
    theirsContent,
    "er",
    "Update care plan (ER)",
    "2026-06-12",
  );

  return { ours, theirs, filepath: CONFLICT_FILE };
}

// Detect file-level conflicts between two branches: find the merge-base, then
// for every file changed on BOTH sides relative to the base where ours != theirs,
// emit a MergeConflict carrying base/ours/theirs content + author labels.
export async function detectConflicts(repoId: string, ours: string, theirs: string): Promise<MergeConflict[]> {
  await ensureRepoBuilt(repoId);
  const dir = repoPath(repoId);

  const oursOid = await tipOid(repoId, ours);
  const theirsOid = await tipOid(repoId, theirs);
  const bases = await git.findMergeBase({ fs, dir, oids: [oursOid, theirsOid] });
  const baseOid: string | undefined = bases[0];

  // Union of files present across base/ours/theirs.
  const [baseFiles, oursFiles, theirsFiles] = await Promise.all([
    baseOid ? git.listFiles({ fs, dir, ref: baseOid }) : Promise.resolve([] as string[]),
    git.listFiles({ fs, dir, ref: oursOid }),
    git.listFiles({ fs, dir, ref: theirsOid }),
  ]);
  const candidates = Array.from(new Set([...baseFiles, ...oursFiles, ...theirsFiles]));

  const oursLabel = await branchLabel(repoId, ours);
  const theirsLabel = await branchLabel(repoId, theirs);

  const conflicts: MergeConflict[] = [];
  for (const filepath of candidates) {
    const [baseText, oursText, theirsText] = await Promise.all([
      baseOid ? fileAtOid(repoId, baseOid, filepath) : Promise.resolve(""),
      fileAtOid(repoId, oursOid, filepath),
      fileAtOid(repoId, theirsOid, filepath),
    ]);
    const oursChanged = oursText !== baseText;
    const theirsChanged = theirsText !== baseText;
    // A real conflict: both sides changed the file AND they disagree.
    if (oursChanged && theirsChanged && oursText !== theirsText) {
      conflicts.push({
        repoId,
        filepath,
        base: baseText,
        ours: oursText,
        theirs: theirsText,
        oursLabel,
        theirsLabel,
      });
    }
  }
  return conflicts;
}

// Resolve a merge: write the human-resolved content for each conflicting file
// into a new tree (carrying forward all non-conflicting files from `ours`), then
// create a real MERGE commit with parents [oursOid, theirsOid] and fast-forward
// main to it. Returns the merge commit oid.
export async function resolveMerge(
  repoId: string,
  ours: string,
  theirs: string,
  resolutions: { filepath: string; content: string }[],
): Promise<string> {
  await ensureRepoBuilt(repoId);
  const dir = repoPath(repoId);

  const oursOid = await tipOid(repoId, ours);
  const theirsOid = await tipOid(repoId, theirs);

  // Base the merged tree on `ours`, then apply each resolution + fold in any
  // files that exist only on `theirs` (so the merge keeps both sides' additions).
  const { commit: oursCommit } = await git.readCommit({ fs, dir, oid: oursOid });
  const { tree: oursTree } = await git.readTree({ fs, dir, oid: oursCommit.tree });

  const entries: Map<string, { mode: string; path: string; oid: string; type: "blob" | "tree" | "commit" }> =
    new Map();
  for (const e of oursTree) entries.set(e.path, { mode: e.mode, path: e.path, oid: e.oid, type: e.type });

  // Bring over files added only on theirs (not present on ours). `entries` holds
  // TOP-LEVEL tree entries only (git.writeTree wants a single flat level, not
  // slashed paths), so we only fold in theirs-only entries whose top-level
  // component isn't already represented on ours. A nested path like
  // "encounters/x.md" lives under the existing "encounters" tree entry (carried
  // over from ours), so it must NOT be inserted as a flat blob here.
  const theirsFiles = await git.listFiles({ fs, dir, ref: theirsOid });
  for (const fp of theirsFiles) {
    const top = fp.split("/")[0];
    // Skip if the top-level component already exists (as a blob or a subtree),
    // or if this is a nested path (subtree contents are inherited from ours).
    if (fp.includes("/") || entries.has(top)) continue;
    if (!entries.has(fp)) {
      const { blob } = await git.readBlob({ fs, dir, oid: theirsOid, filepath: fp });
      const blobOid = await git.writeBlob({ fs, dir, blob });
      entries.set(fp, { mode: "100644", path: fp, oid: blobOid, type: "blob" });
    }
  }

  // Apply resolved content (overrides whatever was there).
  for (const r of resolutions) {
    const blobOid = await git.writeBlob({ fs, dir, blob: enc(r.content) });
    entries.set(r.filepath, { mode: "100644", path: r.filepath, oid: blobOid, type: "blob" });
  }

  const treeOid = await git.writeTree({ fs, dir, tree: Array.from(entries.values()) });

  const oursLabel = await branchLabel(repoId, ours);
  const theirsLabel = await branchLabel(repoId, theirs);

  const mergeOid = await git.commit({
    fs,
    dir,
    message: `Merge ${theirs} into ${ours} (conflict resolved)\n\nReconciled ${oursLabel} with ${theirsLabel}.`,
    tree: treeOid,
    parent: [oursOid, theirsOid],
    noUpdateBranch: true, // don't move HEAD's branch implicitly; we set main below
    author: {
      name: "Maria Reyes",
      email: "maria@hx.demo",
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: 0,
    },
  });

  // Fast-forward main to the merge commit and check it out as the working state.
  await git.writeRef({ fs, dir, ref: "refs/heads/main", value: mergeOid, force: true });
  await git.checkout({ fs, dir, ref: "main", force: true });

  // Clean up the demo branches so the conflict can be re-simulated later.
  try {
    await git.deleteBranch({ fs, dir, ref: ours });
    await git.deleteBranch({ fs, dir, ref: theirs });
  } catch {
    // best-effort cleanup
  }

  return mergeOid;
}

// Convenience: resolved plan content at HEAD after a merge (for the UI).
export async function readMergedFile(repoId: string, filepath = CONFLICT_FILE): Promise<string | null> {
  return readFileAt(repoId, filepath);
}
