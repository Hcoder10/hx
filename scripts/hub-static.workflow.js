export const meta = {
  name: 'hx-static-app',
  description: 'Turn the static web/public UI into the full dynamic app: login/role-picker, repo list, dynamic repo page (files+export+codes+sharing+voice), data-scoping page, dynamic safety page, + backend coded/export endpoints + hx CLI. Nothing hardcoded.',
  phases: [{ title: 'Build' }, { title: 'Integrate' }],
}

const CTX = `
PROJECT: Hx ("GitHub for your health"), AI-psychiatry scope. The APP IS THE STATIC SITE at web/public (plain HTML/CSS/JS, GitHub-style aesthetic). It is served by the Next app at the SAME ORIGIN as the APIs and deployed to Railway (persistent volume), so fetch('/api/...') just works and PERSISTS. Build from C:/Users/sarta/hx (Windows + git-bash; use Bash tool).

ABSOLUTE RULES:
- NOTHING HARDCODED. Every patient-facing number/list/name must come from the API via the shared client. The current web/public/*.html files contain hardcoded demo data (Maria's meds, "3 visits", etc.) — replace those with elements your JS fills from the API. No stale counts left behind.
- Use the SHARED CLIENT window.Hx (already written at web/public/assets/js/hx-api.js — READ IT, do not edit it). Every page must include <script src="assets/js/hx-api.js"></script> BEFORE its own page script. Hx methods:
  Hx.me() -> user|null ; Hx.devLogin(userId) ; Hx.logout() ; Hx.requireSession() -> user (redirects to login.html if not authed)
  Hx.repos() -> [{id,name,description,access,visitCount}] ; Hx.repo(id) -> {repo:{id,name,description,ownerId}, log:[{oid,shortOid,message,authorName,authorEmail,date,parents}]}
  Hx.files(id) -> {files:{medications,problems,allergies}, plan} ; Hx.coded(id) -> {entries:[{section,system,code,term,matchedDescription,accepted}]}
  Hx.visits(id) -> [commit] ; Hx.addVisit(id,{title,summary,date?,notes?,addMedications?,addProblems?,addAllergies?}) ; Hx.editVisit(id,{visitId,...})
  Hx.alerts() -> [{id,severity,title,summary,explanation,whatToDo[],script,involved:[{name,provider,date}]}]
  Hx.shareList(id) ; Hx.createShare(id,access,label) ; Hx.revokeShare(id,token) ; Hx.grant(id,granteeUsername,access) ; Hx.revokeGrant(id,grantId)
  Hx.exportUrl(id,file?) -> a URL string for download ; Hx.startVoice(role,repoId) ; helpers Hx.qs, Hx.param(k), Hx.esc(s), Hx.fmtDate(iso)
- Seeded demo accounts (dev-login): maria=patient, okafor/chen=providers, er=provider. Patients own repos; providers see only granted repos.
- REUSE the existing CSS classes (no editing styles.css). Available: appbar, appbar-inner, brand, app-actions, app-search, icon-btn, av, av-ring, av-mono, wrap, btn, btn-primary, btn-accent, btn-dark, btn-ghost, btn-sm, btn-lg, btn-block, gh-btn, repo-shell, repo-header, repo-titlebar, repo-path, vis-pill, repo-actions, repo-tabs, repo-subbar, repo-banner, repo-layout, filelist, fl-head, file-row, readme, readme-head, readme-body, stat-grid, stat, side-block, side-title, about-list, topics, topic, team-row, meds-line, alert-card, alert-top, alert-body, alert-foot, med-rows, med-row, blamewrap, blame-row, blame-node, checklist, prose-card, cta-band, cta-form, section, section-head, eyebrow, card?, app-foot, backlink, branch-btn, commits, mono, muted. For anything new, add a small <style> block IN YOUR OWN page (do NOT touch styles.css — shared file = collision).
- The app foot has the synthetic-data note; keep it. Keep the bg-aura div.

DELIVERY: keep the gorgeous look. Loading + empty states. On any 401, Hx.requireSession() already redirects to login.html — call it at the top of protected pages. Verify your JS parses: node --check <file>.
`;

phase('Build')

const built = await parallel([
  // A — auth/login + repo list, and index.html entry points
  () => agent(`${CTX}

YOU OWN (edit/create ONLY these):
- web/public/index.html        (edit: route entry points to login.html)
- web/public/login.html        (new)
- web/public/assets/js/login.js (new)
- web/public/repos.html        (new)
- web/public/assets/js/repos.js (new)

TASKS:
1. index.html — point "Sign in", "Get started", the footer Product links, and the phone-number form to **login.html** (instead of app.html). Keep all the marketing content + visuals.
2. login.html + login.js — a warm, on-brand sign-in page (reuse appbar/brand + cta-band/btn styles). Two clear demo entry buttons: "Continue as Maria (patient)" -> Hx.devLogin('maria'); "Continue as Dr. Okafor (psychiatrist)" -> Hx.devLogin('okafor'). Also a small "Other demo accounts" (chen, er). (Passkey is optional — a disabled "Sign in with Face ID" hint is fine; dev-login is the working path.) After login, redirect: patients -> repos.html, providers -> repos.html. Show the synthetic-data note.
3. repos.html + repos.js — the REPO LIST (this is what you see BEFORE a repo page). Call Hx.requireSession(); show the user in the appbar (name + avatar initial) with a Sign out (Hx.logout()->index.html). Render Hx.repos() as GitHub-style repo cards (owner/name, description, a "Private · yours" or access pill, visitCount) — each links to **app.html?repo=<id>**. For patients: a "+ New thread" control (prompt for name -> POST via Hx... note: creating a repo uses POST /api/repos {name,description}; add Hx usage by calling fetch directly if no Hx method) and a prominent button "Manage who can see your data" -> scoping.html. For providers: header "Shared with you" and only the granted repos. Everything dynamic.
node --check both JS files.`, { label: 'auth-repolist', phase: 'Build' }),

  // B — dynamic repo page (files + export + codes + visits + sharing + voice)
  () => agent(`${CTX}

YOU OWN (edit/create ONLY these):
- web/public/app.html             (edit: keep the layout, remove hardcoded data, add hooks + load hx-api.js + repo.js)
- web/public/assets/js/repo.js    (new)

TASKS: make app.html the LIVE repo (thread) page for the repo in ?repo=<id> (default to the user's first repo if absent).
- At top of repo.js: const user = await Hx.requireSession(); const id = Hx.param('repo') || (await Hx.repos())[0]?.id;
- Populate EVERYTHING from the API (remove the hardcoded medications/visits/counts in app.html, replace with empty containers your JS fills):
  * repo title bar: owner / repo name + private pill (from Hx.repo).
  * SAFETY BANNER: from Hx.alerts() — show the top alert (title + involved meds + providers); hide if none. Link to safety.html.
  * Commit count + "latest visit committed by X" + the file list: from Hx.repo(id).log and Hx.files(id). Show medications.md / problems.md / allergies.md rows (with the latest commit short-oid) and an encounters/ folder row (count from log).
  * README/summary, "At a glance" stat-grid (meds/conditions/care-team/safety counts), sidebar Conditions + Care team + Medicines — all derived from the live data (parse the section markdown from Hx.files, or list from the visits).
- TABS (repo-tabs): Timeline (the commit log as a list), Files, Codes.
  * FILES tab: render each file (medications/problems/allergies/plan) as readable text; each with a "Download" link (href = Hx.exportUrl(id, 'medications') etc.) and an "Export all" button (Hx.exportUrl(id)).
  * CODES tab: call Hx.coded(id) and render a clean table grouped by section — Term -> CODE (system) + matched description. Caption "coded by RAG + Grok, deterministically verified".
- ADD VISIT: a control (reuse "Add visit" button) opening a small form (title, summary, notes, optional med name/dose/reason, optional problem) -> Hx.addVisit(id, ...) -> refresh. Small commits OK (just a note).
- SHARING (only if user is the repo owner): a panel to grant a provider (input username/email + read/write -> Hx.grant) and list/revoke; create a share link (Hx.createShare -> show URL with copy) and revoke.
- "Call Hx": wire every Call Hx button to Hx.startVoice(user.role === 'provider' ? 'provider' : 'patient', id).
- NOTES/symptoms logged by voice must appear (show each visit's notes in the Timeline or an expandable visit row).
node --check repo.js.`, { label: 'repo-page', phase: 'Build' }),

  // C — data-scoping page + dynamic safety page
  () => agent(`${CTX}

YOU OWN (edit/create ONLY these):
- web/public/scoping.html          (new)
- web/public/assets/js/scoping.js  (new)
- web/public/safety.html           (edit: make it dynamic, not hardcoded)
- web/public/assets/js/safety.js   (new)

TASKS:
1. scoping.html + scoping.js — the DATA-SCOPING control center (patient). Hx.requireSession() (patient). For EACH of the patient's repos (Hx.repos()), show a card: the thread name, and who currently has access — list active share links (Hx.shareList(id)) and a control to GRANT a provider (input email/username + read/write -> Hx.grant(id,...)) and to CREATE/REVOKE a share link (Hx.createShare/revokeShare). Plain-language framing: "You decide who sees each part of your health." A read-vs-write legend. Reuse side-block/team-row/btn styles. Everything dynamic; nothing hardcoded.
2. safety.html + safety.js — make the existing safety page DYNAMIC: pull Hx.alerts(); render the alert hero (title, severity, summary, explanation), the "involved medicines" rows (involved[] with provider + date), the blame trail (from involved[] + explanation), and the "What to do" checklist (whatToDo[]) and the "what to say to your doctor" (script). If no alerts, show a calm "No safety concerns right now." Keep the layout/aesthetic; replace hardcoded text with live data. Wire the "Call Hx" button -> Hx.startVoice('patient'). It should read ?repo= if present but alerts are cross-repo (patient-wide).
node --check both JS files.`, { label: 'scoping-safety', phase: 'Build' }),

  // D — backend endpoints that power Codes + Export
  () => agent(`${CTX}

YOU OWN (create ONLY these .ts route files; do not touch other .ts):
- web/app/api/repos/[id]/coded/route.ts
- web/app/api/repos/[id]/export/route.ts

Next 16 route handlers: export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) { const { id } = await ctx.params; ... }. export const runtime = "nodejs". Auth: import { getSession } from "@/lib/auth/session"; import { canAccess } from "@/lib/hub/access"; import { getRepo } from "@/lib/hub/store". 401 if no session, 404 if no repo, 403 if !canAccess(session.userId, id, "read").

1. coded/route.ts — GET /api/repos/[id]/coded: read the repo's CURRENT record and code it with the real pipeline.
   - import { listVisitFiles } from "@/lib/hub/repos"  (returns {medications,problems,allergies} markdown) OR read the repo's visits to assemble meds/problems/allergies.
   - Build an Encounter-like object {id:"coded",date:"2026-06-13",providerId:"er",title:"current record",place:"",summary:"", addProblems:[{name}], addMedications:[{name,dose,reason}], addAllergies:[{substance}]} by parsing the section markdown lines (e.g. medications.md lines like "- lisinopril 10 mg — for high blood pressure" -> {name:'lisinopril',dose:'10 mg',reason:'high blood pressure'}; problems.md "- High blood pressure" -> {name}; allergies.md "- Penicillin (rash)" -> {substance,reaction}).
   - import { validateRecord } from "@/lib/validation"; import { formatWithGrok } from "@/lib/hx/grok"; const { results } = await validateRecord(enc, formatWithGrok);
   - return Response.json({ entries: results.map(r => ({section:r.section,system:r.system,code:r.code,term:r.term,matchedDescription:r.matchedDescription,accepted:r.accepted})) }).
2. export/route.ts — GET /api/repos/[id]/export?file=medications|problems|allergies (optional). Use listVisitFiles(id). If file given, return that markdown with headers Content-Type text/markdown + Content-Disposition: attachment; filename="<id>-<file>.md". If no file, concatenate all sections into one markdown bundle "<repoName>.md" as an attachment download.
Run \`cd C:/Users/sarta/hx/web && npx tsc --noEmit\` and fix errors you introduce.`, { label: 'coded-export-api', phase: 'Build' }),

  // E — the hx CLI
  () => agent(`${CTX}

YOU OWN (create ONLY, new top-level dir): cli/  (C:/Users/sarta/hx/cli)
Build the hx CLI in Node ESM (global fetch). cli/package.json (name "hx", type module, bin {"hx":"./bin/hx.mjs"}), cli/bin/hx.mjs (#!/usr/bin/env node), cli/README.md, cli/lib/*.mjs as needed.
- Config: base URL from env HX_HUB_URL or ~/.hx/config.json (default https://hx-web-production.up.railway.app). Save the session cookie from /api/auth/dev-login into ~/.hx/session; send it on later calls.
- Commands: hx login [--as maria|okafor|chen|er]; hx whoami; hx repos; hx log <repoId>; hx show <repoId>; hx check (GET /api/hub/alerts, exit 1 if any high); hx blame <repoId>; hx commit <repoId> --title T [--note N] [--med "name|dose|reason"]; hx export <repoId> [-o file]; hx share <repoId> --to <username> --access read|write.
- Clean ANSI output, git-like. Friendly errors ("run hx login first"). README with the demo flow.
Verify: node cli/bin/hx.mjs --help prints usage; node cli/bin/hx.mjs repos must not crash when unauthenticated. Plain JS — do not run tsc.`, { label: 'hx-cli', phase: 'Build' }),
])

log(`Build done: ${built.filter(Boolean).length}/5 agents`)

phase('Integrate')

const integrate = await agent(`${CTX}

All five agents have run (auth+repolist, repo-page, scoping+safety, coded/export API, CLI). INTEGRATE & VERIFY:
1. cd C:/Users/sarta/hx/web && npm run build  — must exit 0 (this builds the new .ts endpoints + serves /public). Fix any TS/route errors (async params, runtime="nodejs", imports).
2. For EACH static JS file, run node --check: web/public/assets/js/{hx-api,login,repos,repo,scoping,safety}.js — fix syntax errors.
3. Confirm every static page includes <script src="assets/js/hx-api.js"></script> before its page script, and that pages call Hx.requireSession() where needed.
4. node C:/Users/sarta/hx/cli/bin/hx.mjs --help must print usage.
5. Sanity: grep the static HTML for obvious leftover hardcoded patient data that should be dynamic (e.g. a hardcoded "3 visits committed" not wrapped in a JS-filled element) and fix if a quick id swap.
6. Re-run npm run build until clean.
Return PASS/FAIL + files fixed + any remaining hardcoded spots.`, { label: 'integrate', phase: 'Integrate' })

return { built: built.map((b) => (b ? 'ok' : 'null')), integrate }
