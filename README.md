# Hx — your health history, version-controlled

**GitHub for your health.** Your medical record as a real git repo: encounters are commits, `hx diff` shows what changed between visits, `hx blame` shows which provider added what, and `hx check` catches dangerous conflicts across your fragmented charts.

Three interfaces over one engine:
- **`hx` CLI** — works like git/GitHub, for power users.
- **A warm app** — for everyone; a family member sets it up with a passkey and the record is stored on their device.
- **A phone line** — call a Grok voice agent to add a visit or check conflicts, hands-free, in any language.

Built at the **Autonomous Healthcare Hackathon** (June 13, 2026).

## ⚠️ Synthetic data only
All data in this project is **synthetic** (Synthea-generated). **No real PHI** is used or stored.

## Status
Early build — scaffolding in progress.

## Setup
1. Copy `.env.example` to `.env.local` and fill in your keys (`.env.local` is gitignored).
2. _(scaffold instructions coming as the app lands)_
