# Documentation gaps for the schema 8 / architect-web / interviewer-v8 / Fresco 4 release

- **Date:** 2026-06-19
- **Status:** approved scope, pre-implementation
- **Branch:** `feat/docs-restructure-by-function` (working branch `claude/goofy-shaw-81a1e2`)
- **App:** `apps/documentation`

## Background

A coordinated release ships schema 8 (authored only in Architect Web, run only in
Fresco 4 / Interviewer 8), the new browser-based Architect Web, and Fresco 4 (the
`next` branch, v4.0.0). Fresco only ever documents its latest release, so Fresco docs
must describe `next` behaviour. Architect/Interviewer keep prior + current docs.

A read-only investigation (11 agents, evidence-cited) checked every candidate area
against the real source: `apps/architect-web` + `packages/protocol-utilities` for
preview synthetic data, `packages/protocol-validation/src/schemas/8` for schema 8,
and a clone of the Fresco `next` branch for everything Fresco. Full findings are in
the run output; the key result is that **most candidate features are already
documented accurately in this branch** — the genuine gaps are narrower and are listed
below.

### Already accurate — no work needed

- Fresco synthetic data — `using-fresco.en.mdx` has a matching section.
- Fresco multiple accounts — `accounts.en.mdx` matches `next` (equal accounts, no roles).
- Fresco interview API — `analyze-data/fresco-api.en.mdx` is new and correct.
- Fresco storage provider — `advanced.en.mdx` + `guide.en.mdx` cover it thoroughly.
- Architect preview synthetic data — `preview-mode.en.mdx` documents the toggle.
- Schema 8 headline — `protocol-schema-information.en.mdx` + the 4 new interface docs exist.

## Scope

**In scope (approved):**

1. Schema 8 — refresh the cross-cutting **key-concepts** pages (the real schema-8 gap).
2. Fresco **interviews-table advanced filtering** (`using-fresco.en.mdx`).
3. Fresco **audit log + CSV download** (`using-fresco.en.mdx` + `it-faq.en.mdx`).
4. Architect preview **TipBox fix** (`building-a-protocol.en.mdx`).
5. Fresco **auth factual fix** — passkey is NOT a second factor (`accounts.en.mdx` + `it-faq.en.mdx`).
6. **Bonus:** Architect Web 6 research starter templates; Geospatial shared Mapbox-token warning; 256 MB protocol upload limit.
7. **Re-capture Tier-1 Fresco screenshots** from the live sandbox and wire them in.

**Out of scope (explicitly deferred):**

- Storage troubleshooting section + architecture diagrams.
- Fresco `/api/health` endpoint documentation.
- `SANDBOX_MODE` as a public deployment option.
- Orphan-image pruning (flag to maintainer, do not delete in this pass).

**Defaults applied unless told otherwise:**

- Anonymisation stays framed as **experimental / contact-the-team** (the schema marks it experimental).
- `SANDBOX_MODE` left undocumented as a public option.

## Approach

Each cluster is an independent set of file edits. Writers must **verify
author-/user-facing surfacing in the source before writing** — document only what the
tool actually exposes, not merely what the schema permits. Match existing file voice,
front-matter, and MDX components (`AppSwitch`, `TipBox`, `InterfaceSummary`, etc.).

### Cluster A — Schema 8 key-concepts (largest)

Source of truth for "what's new": `packages/protocol-validation/src/schemas/8/migration.ts`
notes + the `schemas/8/**` files. Verify author UI in `apps/architect-web/src` before
documenting any authoring control.

| File                                                 | Change                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key-concepts/interfaces.en.mdx`                     | Add the 4 new schema-8 interfaces (Geospatial, Anonymisation, One-to-many Dyad Census, Family Pedigree) to the overview/categorisation. Biggest discoverability gap.                        |
| `key-concepts/variables.en.mdx`                      | Add the `location` variable type and the per-variable `encrypted` flag. Verify whether `location` is author-creatable directly or only via the Geospatial interface, and frame accordingly. |
| `key-concepts/field-validation.en.mdx`               | New subsection for cross-variable comparisons: greater/less-than (and -or-equal-to) another variable.                                                                                       |
| `key-concepts/network-filtering.en.mdx`              | Add `contains` / `does not contain` (text) and multi-select `includes` / `excludes` (ordinal/categorical). Use the exact Architect Web operator labels.                                     |
| `key-concepts/skip-logic.en.mdx`                     | Same comparator additions as network-filtering.                                                                                                                                             |
| `key-concepts/forms.en.mdx`                          | Document per-field `hint` (markdown) and `showValidationHints`.                                                                                                                             |
| `key-concepts/codebook.en.mdx`                       | Add dynamic node-shape mapping (variable-driven: discrete categories / numeric breakpoints) IF surfaced in the Architect Web UI; otherwise skip. Verify.                                    |
| `interface-documentation/anonymisation.en.mdx`       | Add an experimental / off-by-default callout.                                                                                                                                               |
| `interface-documentation/family-tree-census.en.mdx`  | Add the active-relationship + gestational-carrier edge variables IF author-configurable. Verify.                                                                                            |
| `advanced-topics/protocol-schema-information.en.mdx` | Two small adds: name the `location` type and the `encrypted` flag in "What's new in schema 8".                                                                                              |

### Cluster B — Fresco interviews-table filtering

`using-fresco.en.mdx`. Expand "Monitoring progress" into a "Finding & filtering
interviews" subsection: identifier search; per-column sort; the six column filters
(protocol multi-select; started/updated date-range with Today / Last 7-30-90-day
presets; progress range with Not Started / In Progress / Complete presets; the network
condition builder — count nodes/edges of a type with =, >, <, ≥, ≤, AND-stackable;
export-status boolean); Clear Filters; and that "Select all N" / Export-all / completed
/ unexported resolve against the active filters server-side (across all pages). Fix the
stale column inventory (add Network + Export Status columns). Use exact UI labels.
Needs a new screenshot of the filtered table / a filter popover.

### Cluster C — Fresco audit log + CSV

- `using-fresco.en.mdx` — expand the activity-feed paragraph: filter by type + free-text
  search; **each entry names the researcher who performed the action**; Export CSV
  (Time / Type / Details → `activity-feed.csv`). Frame as attribution, NOT a per-user
  filtered view — it is a single global feed shown to every admin.
- `it-faq.en.mdx` — update the "What logging and audit information is available?" answer:
  expanded event coverage (auth / 2FA / passkey / API-token / account / settings /
  synthetic-data); username attribution; CSV export. Keep the existing "not immutable,
  capture at the proxy layer" caveat.
- Needs a screenshot of the activity feed.

### Cluster D — Architect preview TipBox + auth fix + bonus

- `design-protocols/building-a-protocol.en.mdx` (lines ~447-455) — wrap the
  manual-node-creation TipBox in an `AppSwitch`: keep for Desktop; for Web, point at the
  "Start preview with example data" toggle. Optional small note in `preview-mode.en.mdx`
  that example data is randomly generated (differs each launch).
- `collect-data/fresco/accounts.en.mdx` + `collect-data/fresco/it-faq.en.mdx` — **auth
  fix.** Remove the false "passkey can be a second factor alongside a password" claim.
  Describe two mutually-exclusive modes: password (optionally + TOTP 2FA, with recovery
  codes) vs passkey-only; switching modes is destructive (wipes the other);
  TOTP is the only second factor; multiple named passkeys are supported; you cannot
  remove your only passkey without first setting a password. Correct nav labels
  (everything lives in the single "User Management" settings card).
- `design-protocols/getting-started.en.mdx` — Architect Web branch of the `AppSwitch`:
  introduce the 6 bundled research starter templates (Transnational Networks, Mental
  Health Networks, Social Connection & Isolation, Behavioural Influence Networks, Care &
  Support Networks, Sexual & Injection Risk Networks). Source:
  `apps/architect-web/src/templates/index.ts`.
- `design-protocols/interface-documentation/geospatial.en.mdx` — callout that templates
  ship a shared rate-limited Mapbox testing token that MUST be replaced with the
  researcher's own token before fielding (and that Architect Web shows a timeline
  warning). Source: `apps/architect-web/src/templates/testingMapboxToken.ts`.
- `collect-data/fresco/using-fresco.en.mdx` (and/or `it-faq.en.mdx`) — state the 256 MB
  per-protocol upload cap, applied for all storage providers. Source:
  `/tmp/fresco-next/fresco.config.ts` `MAX_PROTOCOL_UPLOAD_BYTES`.

### Screenshots (Tier-1, from the live sandbox)

Capture from `https://fresco-sandbox.networkcanvas.com` (request current sandbox credentials via a secure team channel) and
replace the on-disk PNGs under `apps/documentation/public/assets/img/fresco-images/`:

- `features/dashboard.png` — main dashboard hero.
- `settings-page.png` — now a multi-section settings page.
- `synthetic-interview-data.png` — Synthetic Interview Data settings card.
- `user-management.png` — User Management (All Users + passkeys).
- `fresco1.png` (create account), `fresco2.png` (UploadThing token), `configure-storage-s3.png` (S3 form), `fresco3.png` (upload protocol), `fresco4.png` (participation).
- `upgrade.png` — token-update form (re-verify).
- Plus a new screenshot each for the interviews-table filters (Cluster B) and the activity feed (Cluster C).

Third-party-provider shots (GitHub / Netlify / Vercel / Neon / UploadThing / Qualtrics)
are NOT re-captured. Maintain the existing viewport / light theme for consistency.

## Verification / QA

Writers do NOT run formatters/linters (the pre-commit hook owns oxfmt/oxlint). A single
final pass at the end:

- `pnpm lint:fix` (oxfmt + oxlint), `pnpm typecheck`, `pnpm knip`.
- `pnpm --filter @codaco/documentation build` (or root `pnpm build`) — must still emit 94 pages.
- Confirm no `sitemap-0.xml` / build-artifact churn is committed.
- All new/edited screenshots resolve; no broken image references.

## Out-of-scope follow-ups to flag to the maintainer (not done here)

- Storage troubleshooting section + Fresco architecture SVGs.
- `/api/health` documentation; `SANDBOX_MODE` as a supported option.
- ~17 orphan images on disk (prune or wire in `api-tokens-settings.png`).
- The in-app storage link path `/en/fresco/deployment/guide` vs the served `/en/collect-data/fresco/guide`.
- `advanced.en.mdx` POSTGRES\_\* guidance possibly stale vs the prod compose `DATABASE_URL`.
