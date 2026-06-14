export const meta = {
  name: 'hx-hub-build',
  description: 'Build Hx Hub: persistent multi-repo, passkey auth, scoped sharing/commit-access, general drug-interaction engine, git merge conflicts, and UI',
  phases: [
    { title: 'Subsystems' },
    { title: 'UI' },
    { title: 'Integrate' },
  ],
}

// ---- shared context handed to every agent --------------------------------
const CTX = `
PROJECT: Hx ("GitHub for your health"). App at web/ is Next.js 16.2.9 (App Router, Turbopack, TypeScript, Tailwind). Working dir for all commands: C:/Users/sarta/hx/web (use the Bash tool; this is Windows + git-bash).

CRITICAL NEXT 16 RULES (this is NOT the Next.js in your training data):
- Before writing route handlers or pages, read web/AGENTS.md and skim web/node_modules/next/dist/docs for App Router route handlers + dynamic params.
- Route handlers: export async function GET/POST/DELETE(req: Request, ctx). Dynamic route params are ASYNC: the 2nd arg is { params: Promise<{ id: string }> } and you must \`const { id } = await ctx.params\`.
- Any route doing fs / git / crypto / webauthn MUST set \`export const runtime = "nodejs"\`.
- Server components are default; add "use client" only to interactive components.

HARD CONSTRAINTS:
- SYNTHETIC data only. No real PHI. Cryptography is fine; NO blockchain.
- DO NOT modify or break these (the existing working demo): web/lib/validation/**, web/lib/hx/grok.ts, web/lib/hx/voice.ts, web/lib/hx/recommendation.json, web/app/api/voice/**, web/app/app/call/**, web/app/app/validate/**, web/app/app/next-appointment/**, web/app/api/visits/**, web/app/api/validate/**. The existing /app timeline pages must keep building.
- The SPINE already exists — IMPORT from it, do NOT rewrite it:
  web/lib/hub/model.ts  (types: User, StoredCredential, Repo, Grant, ShareToken, Visit, VisitCommit, MergeConflict, Session, Role, AccessLevel)
  web/lib/hub/seed.ts   (SEED_USERS, SEED_REPOS, SEED_GRANTS, SEED_VISITS:Record<repoId,Visit[]>)
  web/lib/hub/store.ts  (persistent JSON store; exports DATA_DIR, REPOS_ROOT, ensureSeededMetadata(), and CRUD:
     listUsers/getUser/getUserByUsername/createUser,
     getCredentialsByUser/getCredentialById/addCredential/updateCredentialCounter,
     listRepos/listReposByOwner/getRepo/createRepo,
     listGrants/grantsForRepo/grantsForGrantee/addGrant/revokeGrant,
     listTokens/getToken/tokensForRepo/addToken/revokeToken,
     setChallenge/getChallenge/clearChallenge)
- isomorphic-git ("git") and "fs" are available (see web/lib/hx/repo.ts for the existing single-repo pattern to mirror).
- @simplewebauthn/server@13 and @simplewebauthn/browser@13 are installed.

QUALITY BAR: When you finish, run \`cd C:/Users/sarta/hx/web && npx tsc --noEmit\` and FIX every type error your files introduce. Keep imports real. Return a concise list of the files you created/changed and any assumptions.
`;

phase('Subsystems')

const subsystems = await parallel([
  // 1) GIT — multi-repo manager + merge-conflict engine
  () => agent(`${CTX}

YOU OWN THESE FILES (create them; do not touch others):
- web/lib/hub/repos.ts
- web/lib/hub/merge.ts

web/lib/hub/repos.ts — multi-repo git manager (mirror web/lib/hx/repo.ts but per-repoId, and PERSISTENT — never rm -rf an existing repo):
- repoPath(repoId) = path.join(REPOS_ROOT, repoId)
- async ensureRepoBuilt(repoId): if the dir has no .git, git.init({defaultBranch:"main"}) then commit each SEED_VISITS[repoId] in date order (use commitVisit logic). If it already exists, do nothing (persistence).
- async commitVisit(repoId, visit: Visit): write cumulative section files medications.md / problems.md / allergies.md (aggregate ALL visits so far in the repo) and encounters/<visit.id>.md, git.add each, git.commit with author = getUser(visit.authorId) (name + email), timestamp from visit.date at 12:00Z. Return the new commit oid. A visit may be SMALL/partial — e.g. only notes (a symptom update), or only a lab result, or only one med — all Visit content arrays are optional; handle minimal visits gracefully (still a real commit).
- async editVisit(repoId, visitId, patch: Partial<Visit> & { authorId: string }): COMMITTING ALSO MEANS EDITING. Re-write encounters/<visitId>.md with the merged/updated content and re-aggregate the section files, then commit a new commit (message like "Update <title>") authored by patch.authorId. This is how an existing visit is amended (git keeps full history). Return the new oid.
- async getLog(repoId): VisitCommit[] (map git.log; include parents = c.commit.parent, shortOid = oid.slice(0,7)).
- async listVisitFiles(repoId, oid?): read the section .md files at HEAD (or oid) and return their text.
- async readFileAt(repoId, filepath, oid?): string | null.
- async allMedicationsForOwner(ownerId): aggregate meds across ALL repos owned by ownerId, each tagged with provenance { name, dose, reason, providerName, providerRole, date, repoId, repoName }. (Read SEED_VISITS + any extra commits; simplest: parse from the stored visits — to be robust, keep an internal record of visits per repo by re-reading commit history OR re-derive from SEED_VISITS plus a visits.json you maintain. Simplest reliable approach: maintain web data via the git repo — but for meds aggregation, reading SEED_VISITS plus any runtime-added visits is acceptable; persist runtime visits by also appending them to a per-repo visits list file (visits.json inside the repo dir, committed) so you can re-read them.) Return MedWithProvenance-like objects suitable for the interaction engine (fields: name, dose, reason, providerName, providerRole, date).
- Call ensureSeededMetadata() (from store) before any repo op so users/repos exist.

web/lib/hub/merge.ts — git MERGE-CONFLICT flow (isomorphic-git has limited auto-merge; implement a manual 3-way at file granularity):
- async simulateConcurrentEdit(repoId): create the demo conflict. From current HEAD, create two branches ("provider-a","provider-b") that each change the SAME file (e.g. medications.md, or a dedicated plan.md) to DIFFERENT content, each committed by a different provider. Leave them unmerged. Return {ours, theirs} branch names + the conflicting filepath.
- async detectConflicts(repoId, ours, theirs): MergeConflict[] — find the merge-base (git.findMergeBase), for each file changed on both sides relative to base where ours!=theirs, produce a MergeConflict {repoId, filepath, base, ours, theirs, oursLabel, theirsLabel} (labels = author name+date of each branch tip).
- async resolveMerge(repoId, ours, theirs, resolutions: {filepath, content}[]): write resolved files, build a tree (git.writeBlob/writeTree or git.add+writeTree), and git.commit a MERGE commit with parent = [oursOid, theirsOid] (pass parent array), message "Merge ... (conflict resolved)". Fast-forward main to it. Return the merge oid.
- Use git.readBlob, git.resolveRef, git.writeBlob, git.writeTree, git.commit, git.branch, git.checkout, git.findMergeBase, git.listFiles as needed.

Test your file compiles (npx tsc --noEmit) and FIX errors you introduce.`, { label: 'git-manager', phase: 'Subsystems' }),

  // 2) AUTH — WebAuthn passkey for patients + providers + session
  () => agent(`${CTX}

YOU OWN THESE FILES (create them):
- web/lib/auth/session.ts
- web/lib/auth/webauthn.ts
- web/app/api/auth/register/options/route.ts
- web/app/api/auth/register/verify/route.ts
- web/app/api/auth/login/options/route.ts
- web/app/api/auth/login/verify/route.ts
- web/app/api/auth/logout/route.ts
- web/app/api/auth/me/route.ts
- web/app/api/auth/dev-login/route.ts

Implement REAL passkey auth for BOTH roles (patient + provider) with @simplewebauthn/server@13.
- Config from env with safe local defaults: rpID = process.env.HX_RP_ID || "localhost"; rpName = "Hx"; origin = process.env.HX_ORIGIN || "http://localhost:3000". expectedOrigin may be a single string.
- session.ts: a SIGNED cookie "hx_session" (HMAC-SHA256 with process.env.HX_SESSION_SECRET || "dev-hx-secret-change-me", httpOnly, sameSite lax, path /). encodeSession({userId,role}) -> string; getSession(req: Request): Session | null (parse cookie header, verify HMAC); setSessionCookie(res-or-return headers) helper; clearSessionCookie(). Provide a helper to build a Response with Set-Cookie. Also export requireSession(req): Session (throws/returns null caller handles).
- webauthn.ts: thin wrappers around generateRegistrationOptions / verifyRegistrationResponse / generateAuthenticationOptions / verifyAuthenticationResponse using the store for users + credentials + challenges. Store credential publicKey as base64url string; convert to/from Uint8Array (use isoBase64URL from @simplewebauthn/server/helpers or Buffer). v13 verifyAuthenticationResponse expects \`credential: { id, publicKey: Uint8Array, counter, transports }\`.
- register/options: body {username, displayName, role}. If user exists, use it; else create via store.createUser. generateRegistrationOptions(excludeCredentials = user's creds). setChallenge(username, options.challenge). Return options. Track pending {displayName, role} in the challenge key or a temp record so verify can create the user if needed.
- register/verify: body {username, response}. verifyRegistrationResponse with expectedChallenge=getChallenge(username). On success: addCredential, clearChallenge, set session cookie for the user, return {ok, user:{id,role,displayName}}.
- login/options: body {username}. user = getUserByUsername; generateAuthenticationOptions(allowCredentials = user's creds). setChallenge(username, challenge). Return options.
- login/verify: body {username, response}. verifyAuthenticationResponse; updateCredentialCounter; set session; return user.
- logout: clear cookie.
- me: return current session user (id, role, displayName, providerRole, org) or 401.
- dev-login: POST {userId} OR {username} -> sets a session cookie for a SEEDED user without a passkey (for demo + testing). This is a deliberate demo convenience; keep it.
All these routes: export const runtime = "nodejs".
Run npx tsc --noEmit and fix your errors.`, { label: 'auth', phase: 'Subsystems' }),

  // 3) ACCESS — grants, share tokens, repo APIs
  () => agent(`${CTX}

YOU OWN THESE FILES (create them):
- web/lib/hub/access.ts
- web/app/api/repos/route.ts
- web/app/api/repos/[id]/route.ts
- web/app/api/repos/[id]/visits/route.ts
- web/app/api/repos/[id]/grant/route.ts
- web/app/api/repos/[id]/share/route.ts
- web/app/api/shared/[token]/route.ts
- web/app/api/hub/alerts/route.ts

NOTE: web/lib/hub/repos.ts (git manager) and web/lib/auth/session.ts are being written in parallel by other agents. Import from them by their known signatures:
  import { ensureRepoBuilt, commitVisit, getLog, allMedicationsForOwner, readFileAt } from "@/lib/hub/repos"
  import { getSession } from "@/lib/auth/session"
If a needed export is missing at integration time it will be fixed in the Integrate phase; code to these names.

web/lib/hub/access.ts (pure-ish authz over the store):
- canAccess(userId, repoId, level: AccessLevel): boolean — patient owner of the repo => true (read+write). provider => true if an active grant (store.grantsForRepo) for them with access >= level (write implies read).
- listAccessibleRepos(userId): for a patient -> their owned repos; for a provider -> repos they have an active grant on (include the grant access level).
- resolveShareToken(token): {repo, access} | null — valid if token exists, not revoked, not expired.

API (all runtime="nodejs"; require a session via getSession unless noted):
- GET /api/repos -> { repos: [...] } accessible to the session user (owned for patients, granted for providers; include name, description, access, visitCount via getLog length). POST /api/repos (patient only) {name, description} -> createRepo + ensureRepoBuilt.
- GET /api/repos/[id] -> { repo, log } if canAccess read.
- GET /api/repos/[id]/visits -> visits/log; POST -> add a visit (requires write); PATCH -> edit an existing visit (requires write, body includes visitId -> editVisit). Body: a Visit-ish {title?, place?, summary?, date?, notes?, addMedications?, addProblems?, addAllergies?} — ALL optional so SMALL commits work (e.g. just a lab result note, or just new symptoms reported by the patient). set authorId = session.userId; call commitVisit (add) or editVisit (edit). (Optionally run validateRecord from @/lib/validation but not required.)
- POST /api/repos/[id]/grant (patient owner only) {granteeUsername|granteeId, access} -> store.addGrant (look up or create provider user by username). DELETE /api/repos/[id]/grant {grantId} -> revokeGrant.
- POST /api/repos/[id]/share (owner) {access, label?, expiresAt?} -> store.addToken with a random url-safe token (crypto.randomUUID or randomBytes base64url). GET -> list tokens for repo. DELETE {token} -> revokeToken.
- GET /api/shared/[token] -> read-only repo view (repo + log) via resolveShareToken, NO session required.
- GET /api/hub/alerts -> cross-repo safety alerts for the current PATIENT: meds = await allMedicationsForOwner(session.userId); import { checkConflicts } from "@/lib/hx/conflicts"; return checkConflicts(meds). (meds objects must include providerName, providerRole, date, dose, name.)
Run npx tsc --noEmit and fix your errors.`, { label: 'access-api', phase: 'Subsystems' }),

  // 4) CONFLICTS — general drug-interaction engine (backward compatible)
  () => agent(`${CTX}

YOU OWN THIS FILE (edit in place, keep it backward compatible):
- web/lib/hx/conflicts.ts

It currently exports checkConflicts(meds: MedWithProvenance[]): Alert[] and only catches SSRI+tramadol (serotonin syndrome). web/lib/hx/index.ts and web/app/api/alerts/route.ts import checkConflicts — DO NOT change its signature or break them. Read web/lib/hx/model.ts for MedWithProvenance and Alert.

Upgrade it to a GENERAL, deterministic interaction engine:
- Define an INTERACTIONS table: ~25-35 clinically real, common, dangerous pairs expressed as two drug-CLASS matchers (arrays of lowercase name substrings) + severity + a plain-language explanation template + whatToDo steps. Cover at least: SSRIs/SNRIs + tramadol/triptans/MAOIs (serotonin syndrome); warfarin + NSAIDs/aspirin (bleeding); ACE inhibitors/ARBs + potassium-sparing diuretics/potassium (hyperkalemia); benzodiazepines/opioids combined (respiratory depression); statins + macrolides/azole antifungals (rhabdomyolysis); metformin + iodinated contrast; MAOIs + SSRIs; nitrates + PDE5 inhibitors (sildenafil); clarithromycin/erythromycin + many; methotrexate + NSAIDs; lithium + NSAIDs/ACEi; digoxin + amiodarone/verapamil. Use ingredient name substrings (e.g. SSRIs = ["sertraline","fluoxetine","citalopram","escitalopram","paroxetine"], etc.).
- checkConflicts(meds): for each unordered pair of meds matching the two sides of an interaction, emit an Alert with provenance (provider names + dates of the two meds, "neither record showed the other" when providers differ). Keep the EXISTING serotonin alert quality (title/summary/explanation/whatToDo/script/involved) as the template; generalize it. Preserve a stable id per interaction type. Sort by severity (high first). Do not double-emit the same pair.
- Keep it pure + deterministic (no network). Export the INTERACTIONS table too (named export) for reuse/tests.
Run \`cd C:/Users/sarta/hx/web && npx tsc --noEmit\` and ensure NOTHING breaks (existing /api/alerts must still compile).`, { label: 'conflicts', phase: 'Subsystems' }),
])

log(`Subsystems done: ${subsystems.filter(Boolean).length}/4 returned`)

phase('UI')

const ui = await agent(`${CTX}

The backend is built: spine (web/lib/hub/{model,seed,store}.ts), git manager (web/lib/hub/repos.ts), merge (web/lib/hub/merge.ts), auth (web/lib/auth/*, web/app/api/auth/*), access + repo APIs (web/lib/hub/access.ts, web/app/api/repos/*, /api/shared/[token], /api/hub/alerts), general interactions (web/lib/hx/conflicts.ts). @simplewebauthn/browser@13 is installed (startRegistration/startAuthentication).

BUILD THE HUB UI under web/app/hub/** (you own this whole subtree; also you may add web/app/hub/components/*). Warm, plain-language, non-techie friendly (this is for patients outside the tech bubble) — but reveal the real git underneath for technical judges. Tailwind. Mobile-friendly. Use "use client" where interactive; fetch the APIs above.

Pages:
- web/app/hub/page.tsx — landing: choose "I'm a patient" or "I'm a provider", then register or sign in with a PASSKEY (use @simplewebauthn/browser startRegistration/startAuthentication against /api/auth/*). Include a small "Use a demo account" section that calls /api/auth/dev-login for the seeded users (maria / dr.okafor / dr.chen / records@mercygeneral.example) so judges can get in instantly. On success route patients to /hub/patient and providers to /hub/provider.
- web/app/hub/patient/page.tsx — patient dashboard: greet by name (GET /api/auth/me); list my repos/threads (GET /api/repos) as warm cards (name, description, visit count) linking to /hub/repo/[id]; a "+ New thread" action (POST /api/repos); a SAFETY panel showing GET /api/hub/alerts (cross-repo interaction alerts) prominently with severity colors.
- web/app/hub/repo/[id]/page.tsx — one thread: timeline of visits (commits) from GET /api/repos/[id] (each commit = a visit, show author/provider + date + message + short oid for the git reveal); show the section files (meds/problems/allergies). If the viewer has write access, an "Add visit" form (POST /api/repos/[id]/visits). A "Sharing" section (patient owner only): list/add/revoke provider grants (POST/DELETE /api/repos/[id]/grant) and share links (POST/GET/DELETE /api/repos/[id]/share) with copy-to-clipboard. A "Show merge conflict demo" button area linking to the conflicts UI below.
- web/app/hub/provider/page.tsx — provider dashboard: "Repos shared with me" (GET /api/repos returns granted repos for providers) as cards linking to /hub/repo/[id]; make clear they only see what the patient shared.
- web/app/hub/shared/[token]/page.tsx — read-only view of a shared repo via GET /api/shared/[token] (no login). Banner: "Shared by the patient · read-only".
- web/app/hub/repo/[id]/conflicts/page.tsx — MERGE CONFLICT resolution UI: a button to trigger the demo (POST a new route /api/repos/[id]/merge with action "simulate" -> calls merge.simulateConcurrentEdit; action "detect" -> detectConflicts; action "resolve" -> resolveMerge). Show each MergeConflict with "ours" vs "theirs" side by side (labelled by provider/date), let the user pick a side or edit, then resolve into a merge commit. YOU also create web/app/api/repos/[id]/merge/route.ts (runtime nodejs) wiring to web/lib/hub/merge.ts (simulateConcurrentEdit/detectConflicts/resolveMerge) with write-access check via @/lib/hub/access + @/lib/auth/session.

Add a link to /hub from the existing home page web/app/page.tsx ONLY by appending a small link/button (do not remove existing content).

Run \`cd C:/Users/sarta/hx/web && npx tsc --noEmit\` and fix UI type errors you introduce.`, { label: 'hub-ui', phase: 'UI' })

phase('Integrate')

const integrate = await agent(`${CTX}

All Hub subsystems + UI have been written by previous agents (web/lib/hub/*, web/lib/auth/*, web/app/api/auth/*, web/app/api/repos/*, web/app/api/shared/*, web/app/api/hub/*, web/app/hub/**, updated web/lib/hx/conflicts.ts). Your job is INTEGRATION: make the whole thing compile and cohere WITHOUT breaking the existing demo.

Do this:
1. cd C:/Users/sarta/hx/web && npm run build  (Next 16 production build).
2. Read every error. Fix them: reconcile mismatched function names/signatures BETWEEN the parallel-written modules (e.g. access-api expected an export from repos.ts that has a slightly different name — make them match; prefer adjusting the CONSUMER unless the producer's name is clearly wrong). Fix Next 16 async-params issues, missing "use client", missing runtime="nodejs", bad imports, type errors.
3. Ensure the merge route the UI calls (web/app/api/repos/[id]/merge/route.ts) exists and matches web/lib/hub/merge.ts exports; if names differ, align them.
4. Re-run npm run build until it passes cleanly. Do NOT delete features to make it pass — wire them correctly. You may make minimal edits to any web/lib/hub/*, web/lib/auth/*, web/app/** files to integrate.
5. Confirm the existing pages still build (/, /app, /app/validate, /app/call, /app/repo, etc.).
6. Quick smoke logic check: write nothing destructive, but you may run a tiny node script to sanity-check that the spine + repos build a repo (set HX_DATA_DIR to a temp dir).

Return: PASS/FAIL of the final build, the list of files you had to fix and why, and any remaining gaps or assumptions (especially anything needing env vars for deploy: HX_DATA_DIR, HX_RP_ID, HX_ORIGIN, HX_SESSION_SECRET).`, { label: 'integrate', phase: 'Integrate' })

return { subsystems: subsystems.map((s, i) => (s ? 'ok' : 'null')), ui: ui ? 'ok' : 'null', integrate }
