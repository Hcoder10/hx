export const meta = {
  name: 'hx-hub-v2',
  description: 'Make the Hx Hub demo-complete: files+export+codes on the repo page, a data-scoping page, dynamic dashboards/landing (nothing hardcoded), and the hx CLI',
  phases: [{ title: 'Build' }, { title: 'Integrate' }],
}

const CTX = `
PROJECT: Hx ("GitHub for your health"), AI-psychiatry scope. App at web/ = Next.js 16.2.9 (App Router, Turbopack, TS, Tailwind). Commands run from C:/Users/sarta/hx/web (Windows + git-bash; use the Bash tool).

NEXT 16 RULES (NOT your training-data Next): read web/AGENTS.md first. Route handlers: export async function GET/POST(req: Request, ctx). Dynamic params are ASYNC: 2nd arg { params: Promise<{id:string}> }, do \`const { id } = await ctx.params\`. fs/git/crypto routes need \`export const runtime = "nodejs"\`. Client components need "use client".

THE HUB IS REAL AND DYNAMIC — DO NOT HARDCODE PATIENT DATA. Pull everything from the APIs:
- Auth: POST /api/auth/dev-login {userId|username} (seeded ids: maria=patient, chen/okafor/er=providers); GET /api/auth/me; passkey routes under /api/auth/*. Session is a signed cookie (same-origin fetch carries it).
- Repos: GET /api/repos -> {repos:[{id,name,description,access,visitCount}]} (owned for patients, granted for providers). POST /api/repos {name,description} (patient). GET /api/repos/[id] -> {repo, log:[VisitCommit]}. GET /api/repos/[id]/files -> {files:{medications,problems,allergies}, plan}. GET/POST/PATCH /api/repos/[id]/visits. POST /api/repos/[id]/grant {granteeUsername|granteeId, access} ; DELETE {grantId}. GET/POST/DELETE /api/repos/[id]/share. GET /api/shared/[token].
- Alerts (cross-repo, patient): GET /api/hub/alerts -> {alerts:[Alert]} (Alert has id,severity,title,summary,explanation,whatToDo[],script,involved[{name,provider,date}]).
- Coding pipeline: import { validateRecord } from "@/lib/validation"; import { formatWithGrok } from "@/lib/hx/grok"; const { results } = await validateRecord(encounterLike, formatWithGrok). Encounter-like = {id,date,providerId,title,place,summary,notes?,addMedications?,addProblems?,addAllergies?}. results[] each: {section,system,code,term,accepted,reason,matchedDescription,similarity}.
- Hub lib: web/lib/hub/{model,store,repos,access}.ts, web/lib/auth/session.ts (getSession(req)). repos.ts exports listVisitFiles/getLog/readFileAt/allMedicationsForOwner/commitVisit. store.ts: getRepo/listReposByOwner/grantsForRepo/listGrants/getUser/getUserByUsername. access.ts: canAccess(userId,repoId,level), listAccessibleRepos(userId).
- Existing /hub UI: web/app/hub/{page(login),patient,provider,repo/[id],repo/[id]/conflicts,shared/[token]}, components/{ui,useMe,lib,SafetyPanel,SharingPanel,AddVisitForm,Markdown,VoiceAgent,CopyButton}. lib.ts has api() + types; useMe.ts is the session hook; ui.tsx has Card/Button/HubHeader/Spinner/etc.

PERSISTENCE: data lives in git repos on a Railway volume (HX_DATA_DIR=/data). Do NOT change storage. Just read/write via the APIs above.

DON'T TOUCH (other agents / working features): web/lib/validation/**, web/lib/hx/grok.ts, web/lib/hx/voice*.ts, web/app/api/voice/**, web/app/app/**, web/lib/hub/** (read only), web/lib/auth/** (read only), and any files owned by another agent below.

QUALITY: run \`cd C:/Users/sarta/hx/web && npx tsc --noEmit\` and fix type errors you introduce. Match the existing /hub component style (import from ../components/ui, ../lib). Return the files you created/changed + notes.
`;

phase('Build')

const built = await parallel([
  // 1) Repo page: Files (view + export) + Codes (RAG/Grok) on patient AND provider views
  () => agent(`${CTX}

YOU OWN (create/edit only these):
- web/app/hub/repo/[id]/page.tsx   (edit: add a "Files" tab and a "Codes" section)
- web/app/hub/components/FilesPanel.tsx   (new)
- web/app/hub/components/CodesPanel.tsx    (new)
- web/app/api/repos/[id]/coded/route.ts    (new)
- web/app/api/repos/[id]/export/route.ts   (new)

GOAL: the repo (thread) page must show, for BOTH the patient owner and a provider with access:
1. FILES tab — list the repo's files (medications.md / problems.md / allergies.md / plan if present) from GET /api/repos/[id]/files, render each (use the existing Markdown component), and let the user VIEW and EXPORT them:
   - per-file "Download" (download that .md), and an "Export all" button.
   - Build GET /api/repos/[id]/export?file=medications (returns that file as text/markdown with Content-Disposition attachment) and GET /api/repos/[id]/export (returns ALL files concatenated, or a simple .md bundle, as a download). Gate with getSession + canAccess read. FilesPanel calls these (use an <a download> or fetch->blob).
2. CODES — show the coded view: build POST/GET /api/repos/[id]/coded that reads the repo's current meds+problems+allergies (from /api/repos/[id]/files or repos.ts), runs validateRecord(encounterLike, formatWithGrok), and returns the accepted coded entries (term, system, code, matchedDescription). CodesPanel fetches it and renders a clean table: Term -> CODE (system) with the matched description, grouped by section (Problems=ICD-10, Medications=RxNorm, Allergies=UNII). Show a small "coded by RAG + Grok, verified" caption. This is shown on the repo page for both roles.
   IMPORTANT: nothing hardcoded — all data from the APIs. Handle empty/Loading states. runtime="nodejs" on the new routes.

Add a tab bar entry "Files" and a "Codes" panel near the timeline. Keep the existing timeline + add-visit + sharing + merge-conflict link intact. Ensure visit NOTES (e.g. symptoms a patient logged by voice) are visible in the timeline or a visit's detail.
Run tsc and fix your errors.`, { label: 'repo-files-codes', phase: 'Build' }),

  // 2) Data-scoping page + clear dashboards (repo list before repo page)
  () => agent(`${CTX}

YOU OWN (create/edit only these):
- web/app/hub/scoping/page.tsx   (new — the data-scoping control center)
- web/app/hub/patient/page.tsx   (edit — ensure a clear repo LIST + a link to /hub/scoping)
- web/app/hub/provider/page.tsx  (edit — ensure a clear "shared with me" repo list)
- web/app/hub/components/ScopePanel.tsx (new, if useful)

GOAL:
1. /hub/scoping — a patient-facing DATA SCOPING page: list every one of the patient's repos (GET /api/repos) and, for each, who currently has access (GET /api/repos/[id]/share lists share-tokens; grants are returned where available — if no direct grants list endpoint, show share tokens + a per-repo "manage" that reuses the existing SharingPanel component to grant/revoke a provider and create/revoke share links). The point: one screen where Maria sees and controls exactly which provider can see which thread. Warm, plain language ("who can see what"). Include a clear legend of read vs write.
2. /hub/patient — make sure it presents a clean REPO LIST (threads) as cards linking to /hub/repo/[id] (it mostly does); add a prominent link/button to /hub/scoping ("Manage who can see your data"). Keep the SafetyPanel + VoiceAgent that are already there.
3. /hub/provider — ensure it lists the repos shared with the provider as cards (repo list before the repo page).
Everything dynamic from the APIs; nothing hardcoded. Reuse components from ../components/ui, ../components/SharingPanel. Run tsc and fix your errors.`, { label: 'scoping-dashboards', phase: 'Build' }),

  // 3) The hx CLI
  () => agent(`${CTX}

YOU OWN (create only, NEW top-level dir — zero collision):
- cli/  (everything under C:/Users/sarta/hx/cli)

Build the **hx CLI** — "git for your health" on the command line, hitting the Hub API. Node (ESM, uses global fetch from Node 18+). Files: cli/package.json (name "hx", bin: { "hx": "./bin/hx.mjs" }, type module), cli/bin/hx.mjs (entry), cli/README.md, cli/lib/*.mjs as needed.
- Config: base URL from env HX_HUB_URL or a config file ~/.hx/config.json (default https://hx-web-production.up.railway.app). Persist the session cookie returned by /api/auth/dev-login (or login) into ~/.hx/session so subsequent commands are authed.
- Commands:
  hx login [--as maria|okafor|chen|er]   -> POST /api/auth/dev-login, save cookie. (passkey not feasible in CLI — dev-login is the CLI auth.)
  hx whoami                              -> GET /api/auth/me
  hx repos                               -> GET /api/repos, print id / name / access / visitCount (git-remote style)
  hx log <repoId>                        -> GET /api/repos/[id] -> print commits (shortOid, author, date, message) like \`git log --oneline\`
  hx show <repoId>                       -> GET /api/repos/[id]/files -> print current medications/problems/allergies
  hx check                               -> GET /api/hub/alerts -> print interaction alerts (like \`hx check\` in the marketing); exit 1 if any high alert
  hx blame <repoId>                      -> from the log + files, attribute each med/problem to a provider+date (best effort from commit history)
  hx commit <repoId> --title T [--note N ...] [--med "name|dose|reason"] -> POST /api/repos/[id]/visits
  hx export <repoId> [-o file]           -> GET /api/repos/[id]/files and write a markdown bundle locally
  hx share <repoId> --to <username> --access read|write  -> POST /api/repos/[id]/grant
Make output clean + colorized-ish (ANSI ok). Handle errors (not logged in -> tell them to run hx login). README with install (npm i -g . or npx) + the demo flow. Make bin/hx.mjs executable-style (shebang #!/usr/bin/env node). Verify it parses: \`node cli/bin/hx.mjs --help\` should print usage. Do NOT run tsc (it's plain JS). Test: node cli/bin/hx.mjs repos (will 401 if not logged in — that's fine, just shouldn't crash).`, { label: 'hx-cli', phase: 'Build' }),

  // 4) Static landing -> route into the dynamic app (nothing hardcoded presented as live)
  () => agent(`${CTX}

YOU OWN (edit only these):
- web/public/index.html
- web/public/app.html
- web/public/safety.html
- web/public/assets/js/app.js

CONTEXT: these static pages are a beautiful GitHub-style mockup but the DATA is hardcoded. The real, dynamic, persistent app is the Next /hub (login at /hub, repo list at /hub/patient & /hub/provider, repo page at /hub/repo/[id], scoping at /hub/scoping).
GOAL: keep index.html as the gorgeous LANDING, but make every "app" entry point go to the real app so the user can actually log in as patient OR provider and see live, persistent data:
1. index.html — "Sign in" and "Get started" and the footer product links -> point to **/hub** (the login page, where you pick patient/provider or use a demo account). The phone-number form should also go to /hub.
2. app.html and safety.html — these are hardcoded single-patient mockups. Rather than fake-wire them, make them clearly a PREVIEW and add a prominent banner/button "Open your live record →" linking to /hub/patient. The existing app.js already auto-logs-in as Maria and pulls the live /api/hub/alerts into the safety banner — KEEP that live wiring working (so the banner is real, not hardcoded), but anything that can't be made live should link into /hub rather than show stale numbers. Remove or clearly mark any hardcoded counts that aren't wired.
3. Ensure the "Call Hx" voice buttons still work (app.js startVoice) — don't break them.
Do not touch any .ts/.tsx files. This is static HTML/CSS/JS only. Verify app.js parses: \`node --check web/public/assets/js/app.js\`.`, { label: 'static-wiring', phase: 'Build' }),
])

log(`Build phase done: ${built.filter(Boolean).length}/4 agents returned`)

phase('Integrate')

const integrate = await agent(`${CTX}

All four feature agents have run (repo files+codes, scoping+dashboards, CLI, static wiring). INTEGRATE:
1. cd C:/Users/sarta/hx/web && npm run build  (Next 16 production build).
2. Fix every error: reconcile any mismatched imports/signatures between the new files (e.g. a component expecting an API field that differs), Next 16 async-params, missing "use client"/runtime, type errors. Prefer minimal edits; do not delete features.
3. Confirm the new routes exist and compile: /api/repos/[id]/coded, /api/repos/[id]/export, and the pages /hub/scoping, updated /hub/repo/[id], /hub/patient, /hub/provider.
4. node --check web/public/assets/js/app.js (static JS still valid).
5. node C:/Users/sarta/hx/cli/bin/hx.mjs --help (CLI entry parses).
6. Re-run npm run build until clean. Confirm existing pages (/, /hub, /app, /app/validate) still build.
Return: PASS/FAIL of the final build + the list of files you fixed and why + anything still hardcoded that should be wired.`, { label: 'integrate', phase: 'Integrate' })

return { built: built.map((b) => (b ? 'ok' : 'null')), integrate }
