# Agentic Ops Demo

Browser demo of a product-ops control pattern:

**inspect → propose → validate → human approval → execute → re-read → verify → audit**

Synthetic e-commerce fixtures only. Independent reconstruction of control patterns — no employer code, credentials, endpoints, or proprietary rules.

Live page: https://kantzaris10-hub.github.io/Agentic-Ops-Demo/

## Run

Requires Node.js 18+ and Python 3 (static server).

```bash
npm test
npm start
```

Open http://localhost:8080

## What it does

- Structured proposals (deterministic in the public demo; no API keys)
- Deterministic validation and allow-listed writes
- Explicit human approval before mutations
- Post-write re-read and expected-vs-actual checks
- Versioned JSON batch intake (`forge-ops-import/v1`) with row-level results
- Architecture explorer for Forge-style workflow reference (screenshots under `docs/assets/`)

## Tests

```bash
npm test
```

Covers approval bypass, allow-list rejection, ambiguity stop, verification mismatch, and batch schema validation. Details in [`docs/EVALS.md`](docs/EVALS.md).

## Scope

Demo / reconstruction of control patterns. Not a commerce platform, not a live scraping service, and not a claim that the deterministic proposal layer is an LLM. An LLM/tool-calling adapter could replace only the proposal component; the permission and verification boundaries stay the same.

## Docs

| Path | Contents |
|------|----------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Control boundaries and Forge reference map notes |
| [`docs/CAPABILITY_MAP.md`](docs/CAPABILITY_MAP.md) | Modules and safety boundaries |
| [`docs/FORGE_WORKFLOW.md`](docs/FORGE_WORKFLOW.md) | Forge UI screenshots (reference) |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Scope trade-offs |
| [`docs/EVALS.md`](docs/EVALS.md) | What the tests cover |

## Layout

```text
├─ data/                 # synthetic fixtures + architecture map JSON
├─ docs/                 # notes and Forge screenshots
├─ src/
│  ├─ engine.js          # inspect / propose / validate / execute / verify
│  ├─ batch-schema.js    # batch intake validation
│  ├─ app.js             # browser demo UI
│  └─ architecture-map.js
├─ tests/
├─ index.html
└─ style.css
```
