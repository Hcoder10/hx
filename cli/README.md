# hx — git for your health

A small, git-like command-line client for the **Hx Hub**: your medical record as
a set of repositories, with a commit log of visits, cross-repo drug-interaction
checks, `blame` for who changed what, and scoped sharing with your providers.

It talks to the same Hub API the web app uses (same origin, same session), so
anything you do here shows up there and persists.

> All data in the demo is **synthetic** — not a real medical record.

## Install

No build step. Node 18+ (uses the global `fetch`).

```bash
# from the repo
cd cli
npm install        # no deps, just sets up the bin
npm link           # optional: puts `hx` on your PATH

# or run directly
node bin/hx.mjs --help
```

## Configuration

The Hub base URL resolves in this order:

1. `HX_HUB_URL` environment variable
2. `~/.hx/config.json` → `{ "hubUrl": "https://…" }`
3. default: `https://hx-web-production.up.railway.app`

After `hx login`, the session cookie is saved to `~/.hx/session` and sent on every
later call. `hx logout` clears it.

```bash
export HX_HUB_URL=http://localhost:3000   # point at a local dev Hub
```

## Commands

| Command | What it does |
| --- | --- |
| `hx login [--as maria\|okafor\|chen\|er]` | Sign in as a seeded demo account (defaults to `maria`). |
| `hx whoami` | Show the current signed-in user. |
| `hx logout` | Clear the local session. |
| `hx repos` | List the records you can access, with visit counts. |
| `hx log <repoId>` | Commit log of visits, newest first (git-log style). |
| `hx show <repoId>` | Current state: medications, problems, allergies, care plan. |
| `hx check` | Cross-repo safety alerts. **Exits 1 if any alert is high.** |
| `hx blame <repoId>` | Who changed what, when — one line per visit. |
| `hx commit <repoId> --title T [--note N] [--med "name\|dose\|reason"]` | Append a visit (write access). |
| `hx export <repoId> [-o file]` | Download the record as Markdown (stdout, or `-o file`). |
| `hx share <repoId> --to <username> --access read\|write` | Grant a provider scoped access. |

Global: `-h/--help`, `-v/--version`, `--no-color`.

### `hx commit` details

- `--title` is required.
- `--med "name|dose|reason"` may be repeated to add several medications in one
  commit. `dose` and `reason` are optional: `--med "ibuprofen"` is valid.
- `--note "…"` may be repeated; each becomes a note line on the visit.
- `--problem "…"` may be repeated to add diagnoses.
- After a commit that adds medications, the CLI re-runs the interaction check and
  warns you (as the patient) if a new **high** alert just appeared.

```bash
hx commit mental-health \
  --title "Med review" \
  --med "sertraline|50mg|major depressive disorder" \
  --note "PHQ-9 improved to 8" \
  --note "patient tolerating well"
```

## The demo flow

The Hub seeds one patient (**Maria**) with three records, each shared with a
different provider — and a drug interaction that **no single provider can see**
because each one only holds their own slice of the record. That cross-repo blind
spot is the whole point.

```bash
# 1. Be the patient. See her records.
hx login --as maria
hx repos
#   primary-care    Primary Care   [write]   …
#   mental-health   Mental Health  [write]   …
#   emergency       Emergency & Acute [write] …

# 2. The catch: an interaction spanning two providers' records.
hx check          # prints the high alert; exits 1

# 3. Inspect a single record and its history.
hx show mental-health
hx log mental-health
hx blame emergency        # the ER visit, attributed to Mercy General ER

# 4. Switch hats: be the psychiatrist (granted on mental-health only).
hx login --as okafor
hx repos                  # only mental-health is visible
hx commit mental-health --title "Follow-up" --med "bupropion|150mg|adjunct"

# 5. Take the record with you.
hx login --as maria
hx export emergency -o emergency-record.md
```

### Use in CI / scripts

`hx check` exits non-zero when any alert is **high**, so it drops into a guard:

```bash
hx login --as maria
hx check || echo "⚠️  resolve the interaction before proceeding"
```

## Errors

Friendly, not stack traces:

- not signed in → `not signed in — run hx login first`
- no access → `you don't have access to that record`
- Hub unreachable → `could not reach the Hub at <url>` (check `HX_HUB_URL`)

## Files

```
cli/
  bin/hx.mjs        entry point + commands
  lib/config.mjs    base URL + session persistence (~/.hx)
  lib/api.mjs       fetch wrapper (cookie auth, friendly errors)
  lib/render.mjs    git-like formatting
  lib/colors.mjs    tiny ANSI helper (respects NO_COLOR / not-a-TTY)
```
