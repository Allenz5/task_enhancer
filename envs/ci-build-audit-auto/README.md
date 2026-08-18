# Meridian — GUI environment for `ci-build-audit`

A headless content platform for an engineering status site. Every pipeline run in
`server/data.json` is filed as a **Build Report** entry, authored in **Studio**,
classified in the **Taxonomy** manager, and served through the separate
**Delivery Console**.

```bash
npm install
npm start            # http://localhost:5273  (honours $PORT)
npx playwright test  # runs ground_truth.spec.ts against that server
```

`server/data.json` is the only source of data. The server projects it per surface;
nothing is precomputed, cached or mutated, so a fresh start reproduces identical
results.

## Where each answer-critical fact lives

| Field | Only surface that discloses it | How it is reached |
|---|---|---|
| `branch` | Taxonomy → term → membership roster (paginated) | classification is never printed on an entry's own surfaces |
| `status` | Delivery Console → composed query → result set (paginated) | no stage is printed until a query naming it is run |
| `duration_sec` | Studio → entry → **Preview on site** | stored as the `{{ build.duration_sec }}` token; only rendering resolves it |
| `commit_sha` (full) | Studio → entry → Actions → Export publish bundle (downloaded `.md`) | every on-screen surface abbreviates the commit to 7 characters |

The two selection facts live in two different applications and can only be
intersected by hand; the runtime and the full commit identifier are per-entry and
cost one walk each.

## Layout

```
server/index.js      Express routes — one narrow projection per surface
server/model.js      corpus → per-surface projections (the governance rules)
public/              no-build frontend: one script per page + a shared shell
ground_truth.spec.ts a competent agent's walk; asserts against server/data.json
```

Ready signals for automation: `body[data-ready="1"]`, plus `data-page`,
`data-query`, `data-term-page`, `data-query-page`, `data-preview`, `data-export`,
`data-entry`. Simulated latency is fixed (120 ms preview render, 150 ms query
execution) — wait on the attributes, not the clock. Exported bundles land wherever
Playwright is configured to save downloads; the spec copies them to `downloads/`.
