// Presentation helpers: git-like, clean ANSI. Nothing here talks to the network.

import { c, sym, severityColor } from "./colors.mjs";

// Format an ISO date as "Jun 11 2026" (git-log-ish, locale-independent).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, " ")} ${d.getUTCFullYear()}`;
}

// A short relative age, e.g. "(3 days ago)".
export function relAge(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "(today)";
  if (days === 1) return "(yesterday)";
  if (days < 30) return `(${days} days ago)`;
  const months = Math.floor(days / 30);
  if (months < 12) return `(${months} month${months > 1 ? "s" : ""} ago)`;
  const years = Math.floor(days / 365);
  return `(${years} year${years > 1 ? "s" : ""} ago)`;
}

// Split a markdown section file into trimmed, non-heading content lines.
// Drops headings and the "_none recorded_" placeholder the Hub writes for empty
// sections, so an empty section reads as 0 items (not a phantom one).
export function bodyLines(md) {
  if (!md) return [];
  return md
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim() && !/^#{1,6}\s/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .filter((l) => !/^_?none recorded_?$/i.test(l));
}

// Print one git-log style commit block.
export function printCommit(v, { decorate = "" } = {}) {
  const short = v.shortOid || (v.oid ? v.oid.slice(0, 7) : "-------");
  const head = `${c.yellow("commit " + (v.oid || short))}${decorate ? " " + decorate : ""}`;
  console.log(head);
  const who = v.authorName || v.authorEmail || "unknown";
  console.log(`Author: ${who}${v.authorEmail ? " <" + v.authorEmail + ">" : ""}`);
  console.log(`Date:   ${fmtDate(v.date)} ${c.dim(relAge(v.date))}`);
  console.log("");
  for (const line of String(v.message || "").split("\n")) {
    console.log("    " + line);
  }
  console.log("");
}

// Header bar for a repo, GitHub-path style: owner/Name.
export function printRepoHeader(repo, access) {
  const owner = repo.ownerId || "you";
  const tag = access ? c.dim(` [${access}]`) : "";
  console.log(c.bold(`${c.gray(owner + "/")}${c.cyan(repo.name || repo.id)}`) + tag);
  if (repo.description) console.log(c.dim(repo.description));
}

// Print an alert card.
export function printAlert(a) {
  const col = severityColor(a.severity);
  const badge = col(`[${String(a.severity || "info").toUpperCase()}]`);
  console.log(`${badge} ${c.bold(a.title || "Alert")}`);
  if (a.summary) console.log("  " + a.summary);
  if (a.explanation) console.log(c.dim("  " + a.explanation));
  if (Array.isArray(a.involved) && a.involved.length) {
    const inv = a.involved
      .map((m) => `${m.name}${m.provider ? " · " + m.provider : ""}${m.date ? " · " + fmtDate(m.date) : ""}`)
      .join("; ");
    console.log(c.dim("  involves: ") + inv);
  }
  if (Array.isArray(a.whatToDo) && a.whatToDo.length) {
    console.log(c.bold("  What to do:"));
    for (const step of a.whatToDo) console.log(`    ${sym.arrow} ${step}`);
  }
  console.log("");
}

export { c, sym };
