#!/usr/bin/env node
// hx — git for your health. A small, git-like CLI over the Hx Hub API.
//
//   hx login [--as maria|okafor|chen|er]   sign in (dev login)
//   hx whoami                               show the current user
//   hx repos                                list accessible records
//   hx log <repoId>                         commit log of visits
//   hx show <repoId>                        current state: meds / problems / allergies / plan
//   hx check                                cross-repo safety alerts (exit 1 on a high alert)
//   hx blame <repoId>                       who-changed-what timeline (annotated log)
//   hx commit <repoId> --title T [--note N] [--med "name|dose|reason"]
//   hx export <repoId> [-o file]            download the record as Markdown
//   hx share <repoId> --to <user> --access read|write
//
// Config: HX_HUB_URL or ~/.hx/config.json (default https://hx-web-production.up.railway.app).
// Session cookie is saved to ~/.hx/session after login.

import { writeFileSync } from "node:fs";
import { api, HxError } from "../lib/api.mjs";
import { getHubUrl, PATHS } from "../lib/config.mjs";
import { c, sym } from "../lib/colors.mjs";
import {
  fmtDate,
  relAge,
  bodyLines,
  printCommit,
  printRepoHeader,
  printAlert,
} from "../lib/render.mjs";

const VERSION = "0.1.0";
const KNOWN_ACCOUNTS = ["maria", "okafor", "chen", "er"];

// ---------------------------------------------------------------- arg parsing
// Returns { _: [positional...], flags: { key: value|true } }. Supports
// "--key value", "--key=value", "--flag", and short "-o value".
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          out.flags[key] = next;
          i++;
        } else {
          out.flags[key] = true;
        }
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// Collect a flag that may be repeated into an array of strings.
function multi(flags, ...names) {
  const vals = [];
  for (const n of names) {
    const v = flags[n];
    if (v === undefined) continue;
    if (Array.isArray(v)) vals.push(...v);
    else vals.push(v);
  }
  return vals;
}

// parseArgs collapses repeated flags to the last value; re-scan raw argv for
// repeated --med so a provider can add several meds in one commit.
function collectRepeated(argv, name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) {
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith("-")) out.push(v);
    } else if (a.startsWith(`--${name}=`)) {
      out.push(a.slice(name.length + 3));
    }
  }
  return out;
}

// ----------------------------------------------------------------- utilities
function die(msg, code = 1) {
  console.error(`${sym.err} ${msg}`);
  process.exit(code);
}

function needRepoId(args, cmd) {
  const id = args._[0];
  if (!id) die(`usage: hx ${cmd} <repoId>   (run "hx repos" to list ids)`);
  return id;
}

// Wrap a command so auth/network errors print friendly guidance.
async function guard(fn) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof HxError) {
      if (e.network) die(`${e.message}\n  ${sym.arrow} check your connection or set HX_HUB_URL`);
      if (e.status === 401) die(`not signed in — run ${c.bold("hx login")} first`);
      if (e.status === 403) die(`you don't have access to that record`);
      if (e.status === 404) die(`not found — check the repo id with ${c.bold("hx repos")}`);
      die(e.message);
    }
    die(e && e.message ? e.message : String(e));
  }
}

// Parse a --med "name|dose|reason" spec. dose/reason optional.
function parseMed(spec) {
  const parts = String(spec).split("|").map((s) => s.trim());
  const name = parts[0];
  if (!name) return null;
  return { name, dose: parts[1] || "", reason: parts[2] || "" };
}

// --------------------------------------------------------------------- usage
function usage() {
  const b = c.bold;
  console.log(`${b("hx")} — git for your health  ${c.dim("v" + VERSION)}

${b("USAGE")}
  hx <command> [options]

${b("COMMANDS")}
  ${c.cyan("login")}    [--as maria|okafor|chen|er]   sign in (demo dev login)
  ${c.cyan("whoami")}                                 show the current user
  ${c.cyan("logout")}                                 clear the local session
  ${c.cyan("repos")}                                  list records you can access
  ${c.cyan("log")}      <repoId>                       commit log of visits
  ${c.cyan("show")}     <repoId>                       current meds / problems / allergies / plan
  ${c.cyan("check")}                                  cross-repo safety alerts ${c.dim("(exit 1 if any high)")}
  ${c.cyan("blame")}    <repoId>                       who changed what, when
  ${c.cyan("commit")}   <repoId> --title T [--note N] [--med "name|dose|reason"]
  ${c.cyan("export")}   <repoId> [-o file]             download the record as Markdown
  ${c.cyan("share")}    <repoId> --to <user> --access read|write

${b("OPTIONS")}
  -h, --help        show this help
  -v, --version     print the version
  --no-color        disable ANSI colors

${b("CONFIG")}
  Hub URL   ${c.dim(getHubUrl())}
            ${c.dim("override with HX_HUB_URL or " + PATHS.CONFIG_PATH)}
  Session   ${c.dim(PATHS.SESSION_PATH)}

${b("DEMO FLOW")}
  hx login --as maria        # the patient
  hx repos                   # her three records
  hx check                   # the cross-repo interaction her providers couldn't see
  hx login --as okafor       # the psychiatrist
  hx commit mental-health --title "Med review" --med "sertraline|50mg|depression"
`);
}

// ------------------------------------------------------------------ commands
async function cmdLogin(args) {
  const as = args.flags.as || args._[0] || "maria";
  if (typeof as !== "string") die(`usage: hx login --as <${KNOWN_ACCOUNTS.join("|")}>`);
  if (!KNOWN_ACCOUNTS.includes(as)) {
    console.error(
      `${sym.warn} "${as}" is not a known demo account (${KNOWN_ACCOUNTS.join(", ")}); trying anyway…`,
    );
  }
  const res = await api.devLogin(as);
  const u = res.user || {};
  const role = u.role === "provider"
    ? `${u.providerRole || "provider"}${u.org ? " · " + u.org : ""}`
    : "patient";
  console.log(`${sym.ok} signed in as ${c.bold(u.displayName || as)} ${c.dim("(" + role + ")")}`);
  console.log(c.dim(`  session saved to ${PATHS.SESSION_PATH}`));
}

async function cmdWhoami() {
  const { user } = await api.me();
  const u = user || {};
  console.log(c.bold(u.displayName || u.id || "unknown"));
  console.log(`  id:    ${u.id}`);
  console.log(`  role:  ${u.role}${u.providerRole ? " (" + u.providerRole + ")" : ""}`);
  if (u.username) console.log(`  user:  ${u.username}`);
  if (u.org) console.log(`  org:   ${u.org}`);
}

async function cmdRepos() {
  const { repos } = await api.repos();
  if (!repos || !repos.length) {
    console.log(c.dim("no records yet."));
    return;
  }
  // git-remote-ish listing
  const widest = repos.reduce((w, r) => Math.max(w, (r.id || "").length), 0);
  for (const r of repos) {
    const id = (r.id || "").padEnd(widest);
    const count = `${r.visitCount || 0} visit${r.visitCount === 1 ? "" : "s"}`;
    const acc = r.access ? c.dim(`[${r.access}]`) : "";
    console.log(`${c.cyan(id)}  ${c.bold(r.name || "")} ${acc}`);
    const sub = [r.description, c.dim(count)].filter(Boolean).join("  ");
    if (sub) console.log(`${" ".repeat(widest)}  ${sub}`);
  }
}

async function cmdLog(args) {
  const id = needRepoId(args, "log");
  const { repo } = await api.repo(id).catch(() => ({ repo: { id } }));
  const { visits } = await api.visits(id);
  if (repo && repo.name) {
    printRepoHeader(repo);
    console.log("");
  }
  if (!visits || !visits.length) {
    console.log(c.dim("no visits yet."));
    return;
  }
  // newest first, like git log
  const ordered = [...visits].reverse();
  ordered.forEach((v, i) => printCommit(v, { decorate: i === 0 ? c.cyan("(HEAD)") : "" }));
}

async function cmdShow(args) {
  const id = needRepoId(args, "show");
  const [{ repo, log }, { files, plan }] = await Promise.all([
    api.repo(id),
    api.files(id),
  ]);
  printRepoHeader(repo);
  if (log && log.length) {
    console.log(
      c.dim(`  ${log.length} visit${log.length === 1 ? "" : "s"} · last ${fmtDate(log[log.length - 1].date)} ${relAge(log[log.length - 1].date)}`),
    );
  }
  console.log("");

  const section = (title, md) => {
    const items = bodyLines(md);
    console.log(c.bold(title) + c.dim(`  (${items.length})`));
    if (!items.length) console.log(c.dim("  — none recorded"));
    else for (const it of items) console.log(`  ${sym.bullet} ${it}`);
    console.log("");
  };
  section("Medications", files && files.medications);
  section("Problems", files && files.problems);
  section("Allergies", files && files.allergies);

  if (plan && plan.trim()) {
    console.log(c.bold("Care plan"));
    for (const line of bodyLines(plan)) console.log(`  ${sym.bullet} ${line}`);
    console.log("");
  }
}

async function cmdCheck() {
  const { alerts } = await api.alerts();
  if (!alerts || !alerts.length) {
    console.log(`${sym.ok} ${c.green("no interaction alerts across your records")}`);
    return;
  }
  const highs = alerts.filter((a) => a.severity === "high").length;
  console.log(
    c.bold(`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`) +
      (highs ? c.red(`  · ${highs} high`) : ""),
  );
  console.log("");
  for (const a of alerts) printAlert(a);
  if (highs) process.exit(1);
}

async function cmdBlame(args) {
  const id = needRepoId(args, "blame");
  const [{ repo }, { visits }] = await Promise.all([
    api.repo(id).catch(() => ({ repo: { id } })),
    api.visits(id),
  ]);
  if (repo && repo.name) printRepoHeader(repo);
  console.log("");
  if (!visits || !visits.length) {
    console.log(c.dim("nothing to blame — no visits yet."));
    return;
  }
  // git blame-ish: one line per change, who + when, newest first.
  const ordered = [...visits].reverse();
  const wId = ordered.reduce((w, v) => Math.max(w, (v.shortOid || "").length), 7);
  const wWho = ordered.reduce((w, v) => Math.max(w, (v.authorName || v.authorEmail || "").length), 0);
  for (const v of ordered) {
    const short = (v.shortOid || (v.oid || "").slice(0, 7)).padEnd(wId);
    const who = (v.authorName || v.authorEmail || "unknown").padEnd(wWho);
    const date = fmtDate(v.date);
    const msg = String(v.message || "").split("\n")[0];
    console.log(`${c.yellow(short)}  ${c.cyan(who)}  ${c.dim(date)}  ${msg}`);
  }
}

async function cmdCommit(args, rawArgv) {
  const id = needRepoId(args, "commit");
  const title = typeof args.flags.title === "string" ? args.flags.title.trim() : "";
  if (!title) {
    die('a title is required:  hx commit <repoId> --title "Med review" [--med "name|dose|reason"]');
  }
  const notes = multi(args.flags, "note", "n").map(String).filter(Boolean);
  const medSpecs = collectRepeated(rawArgv, "med");
  const meds = [];
  for (const spec of medSpecs) {
    const m = parseMed(spec);
    if (!m) die(`bad --med spec: "${spec}"  (use "name|dose|reason")`);
    meds.push(m);
  }
  const problems = collectRepeated(rawArgv, "problem").map((p) => ({ name: p }));

  const body = { title };
  if (typeof args.flags.summary === "string") body.summary = args.flags.summary;
  if (notes.length) body.notes = notes;
  if (meds.length) body.addMedications = meds;
  if (problems.length) body.addProblems = problems;
  if (typeof args.flags.date === "string") body.date = args.flags.date;

  const res = await api.addVisit(id, body);
  const v = res.visit || {};
  console.log(`${sym.ok} committed ${c.bold(v.title || title)} to ${c.cyan(id)}`);
  if (v.id) console.log(c.dim(`  ${v.id}`));
  for (const m of meds) console.log(`  ${sym.bullet} +med ${m.name}${m.dose ? " " + m.dose : ""}${m.reason ? c.dim(" — " + m.reason) : ""}`);
  for (const p of problems) console.log(`  ${sym.bullet} +problem ${p.name}`);

  // Friendly nudge: a fresh prescription may have created a cross-repo conflict.
  if (meds.length) {
    try {
      const { alerts } = await api.alerts();
      const highs = (alerts || []).filter((a) => a.severity === "high");
      if (highs.length) {
        console.log("");
        console.log(c.yellow(`${sym.warn} ${highs.length} high interaction alert now active — run "hx check"`));
      }
    } catch {
      // alerts are patient-only; providers will just not see this nudge
    }
  }
}

async function cmdExport(args) {
  const id = needRepoId(args, "export");
  const out = (typeof args.flags.o === "string" && args.flags.o) ||
    (typeof args.flags.output === "string" && args.flags.output) || null;

  const [{ repo }, { files, plan }, { visits }] = await Promise.all([
    api.repo(id),
    api.files(id),
    api.visits(id),
  ]);

  const lines = [];
  lines.push(`# ${repo.name || id} — health record export`);
  lines.push("");
  if (repo.description) lines.push(`> ${repo.description}`);
  lines.push(`> Exported ${new Date().toISOString().slice(0, 10)} from ${getHubUrl()}`);
  lines.push(`> Synthetic demo data — not a real medical record.`);
  lines.push("");

  const sect = (title, md) => {
    lines.push(`## ${title}`);
    const items = bodyLines(md);
    if (!items.length) lines.push("_none recorded_");
    else for (const it of items) lines.push(`- ${it}`);
    lines.push("");
  };
  sect("Medications", files && files.medications);
  sect("Problems", files && files.problems);
  sect("Allergies", files && files.allergies);
  if (plan && plan.trim()) {
    lines.push("## Care plan");
    for (const l of bodyLines(plan)) lines.push(`- ${l}`);
    lines.push("");
  }

  lines.push("## Visit history");
  if (!visits || !visits.length) {
    lines.push("_no visits_");
  } else {
    for (const v of [...visits].reverse()) {
      const short = v.shortOid || (v.oid || "").slice(0, 7);
      lines.push(`- **${fmtDate(v.date)}** \`${short}\` — ${String(v.message || "").split("\n")[0]} _(${v.authorName || v.authorEmail || "unknown"})_`);
    }
  }
  lines.push("");

  const md = lines.join("\n");
  if (out) {
    writeFileSync(out, md, "utf8");
    console.log(`${sym.ok} exported ${c.cyan(id)} to ${c.bold(out)} ${c.dim("(" + md.length + " bytes)")}`);
  } else {
    process.stdout.write(md.endsWith("\n") ? md : md + "\n");
  }
}

async function cmdShare(args) {
  const id = needRepoId(args, "share");
  const to = typeof args.flags.to === "string" ? args.flags.to.trim() : "";
  if (!to) die('usage: hx share <repoId> --to <username> --access read|write');
  let access = typeof args.flags.access === "string" ? args.flags.access.trim() : "read";
  if (access !== "read" && access !== "write") {
    die(`--access must be "read" or "write" (got "${access}")`);
  }
  const res = await api.grant(id, to, access);
  const g = res.grant || {};
  console.log(`${sym.ok} granted ${c.bold(access)} on ${c.cyan(id)} to ${c.bold(to)}`);
  if (g.id) console.log(c.dim(`  grant ${g.id}`));
}

// ---------------------------------------------------------------------- main
async function main() {
  const rawArgv = process.argv.slice(2);

  // Pre-scan for color/help/version before anything imports colors at print time.
  if (rawArgv.includes("--no-color")) process.env.HX_NO_COLOR = "1";
  if (!rawArgv.length || rawArgv[0] === "-h" || rawArgv[0] === "--help" || rawArgv[0] === "help") {
    usage();
    return;
  }
  if (rawArgv[0] === "-v" || rawArgv[0] === "--version" || rawArgv[0] === "version") {
    console.log(VERSION);
    return;
  }

  const cmd = rawArgv[0];
  const rest = rawArgv.slice(1).filter((a) => a !== "--no-color");
  const args = parseArgs(rest);

  if (args.flags.help || args.flags.h) {
    usage();
    return;
  }

  switch (cmd) {
    case "login":
      return guard(() => cmdLogin(args));
    case "whoami":
      return guard(cmdWhoami);
    case "logout":
      await api.logout();
      console.log(`${sym.ok} signed out`);
      return;
    case "repos":
      return guard(cmdRepos);
    case "log":
      return guard(() => cmdLog(args));
    case "show":
      return guard(() => cmdShow(args));
    case "check":
      return guard(cmdCheck);
    case "blame":
      return guard(() => cmdBlame(args));
    case "commit":
      return guard(() => cmdCommit(args, rest));
    case "export":
      return guard(() => cmdExport(args));
    case "share":
      return guard(() => cmdShare(args));
    default:
      console.error(`${sym.err} unknown command: ${cmd}`);
      console.error(`run ${c.bold("hx --help")} for usage`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(`${sym.err} ${e && e.message ? e.message : e}`);
  process.exit(1);
});
