# Sketch

Sketch is a one-page site where a researcher describes a network study in plain
language and gets back a working Network Canvas protocol (schema 8). The
protocol opens straight in Architect for editing, or downloads as a
`.netcanvas` file.

Sketch is a prototype. It is a private workspace package (`@codaco/sketch`),
deployed to its own Netlify site, and it is not part of a release lane.

## Architecture

A job runs five steps. They are the five rows the generating screen shows
(`STEP_IDS` in `src/shared/api.ts`):

1. **Read.** A cheap model screens the description. It refuses only when the
   text describes no study at all, and the page shows its hint inline. If the
   screening call fails, the job carries on as if it had passed.
2. **Design.** The design model returns a `StudyDesign` (a constrained JSON
   object, `src/server/design/schema.ts`) under a byte-stable, cached system
   prompt (`src/server/prompts/`). A deterministic preflight normalises and
   checks it (`analyse.ts`), compiles it and validates the result. A design
   with problems gets **one** retry, with the problems spelled out as feedback.
3. **Wording.** A cheap model polishes titles, prompts and screen text. A
   wording failure is not fatal: the design's draft wording is kept.
4. **Compile.** `compile.ts` turns the design plus wording into a schema 8
   protocol: codebook, stages, skip logic, filters and assets (placeholder
   roster CSVs, the world-countries GeoJSON for geospatial stages).
5. **Validate.** `@codaco/protocol-validation` validates the protocol. Only a
   protocol that validates is returned.

The page then hands the protocol to Architect:

- **Open in Architect** opens `ARCHITECT_URL/import-from-sketch` in a new tab
  (never `noopener`). That page posts `{type:'sketch-import:ready', version:1}`
  to its opener every second. Sketch checks the message's source window and
  origin, and replies once with
  `{type:'sketch-import:payload', version:1, protocol, name, assets:[{id, name, data: Blob}]}`
  targeted at Architect's origin. Architect checks the sender against its
  allowlist (`apps/architect/src/config/sketchOrigins.ts`), imports the
  protocol, and answers `{type:'sketch-import:result', version:1, status}`.
  After 20 s with no ready or result, Sketch offers the download instead.
  Code: `src/handoff/openInArchitect.ts` and
  `apps/architect/src/components/SketchImport/`.
- **Download** builds a `.netcanvas` zip (`protocol.json` plus
  `assets/<source>`) in the browser (`src/handoff/netcanvas.ts`).

### Where the code lives

| Path                           | What                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/shared/api.ts`            | The HTTP contract between page and functions (types only).                                         |
| `src/App.tsx`, `src/screens/`  | The page: describe, generating, ready, compare and failed screens.                                 |
| `src/api/`, `src/hooks/`       | API client; job creation and polling.                                                              |
| `src/handoff/`                 | Architect handoff and `.netcanvas` download.                                                       |
| `src/server/pipeline.ts`       | The five steps, with injected provider adapters.                                                   |
| `src/server/design/`           | Design schema, analysis, compiler, retry feedback, assets.                                         |
| `src/server/prompts/`          | System prompts and the decision guide.                                                             |
| `src/server/providers/`        | Anthropic and OpenAI adapters behind one `ProviderAdapter` type.                                   |
| `src/server/handlers.ts`       | Request handlers. The Netlify functions only wire production dependencies into them.               |
| `src/server/jobs.ts`           | Job records, the research log and the daily budget, in Netlify Blobs.                              |
| `netlify/functions/`           | `jobs` (POST /api/jobs), `job` (GET /api/jobs/:id), `config`, `preference`, `generate-background`. |
| `scripts/bundle-functions.mjs` | Bundles the functions with esbuild for deployment (Netlify cannot load workspace TypeScript).      |

`src/server/**` and `netlify/**` compile under `tsconfig.server.json` (Node
types); the rest of `src` compiles under `tsconfig.app.json` (DOM). Server code
uses relative imports only, so the Netlify esbuild bundler can resolve it.

A job runs in `generate-background`, a Netlify background function (up to
15 minutes). `POST /api/jobs` validates the request, checks the budget, writes a
queued job record and starts the background function. The page polls
`GET /api/jobs/:id` every 1.5 s for up to 4 minutes.

## Local development

UI only, against mocked or remote functions:

```sh
pnpm --filter @codaco/sketch dev        # http://localhost:5186
```

Plain `pnpm dev` serves no `/api/*`, so generation (and with it the Architect
handoff) needs the functions too. Run UI and functions together with the
Netlify CLI (and a linked site or local env vars for the keys):

```sh
npx netlify dev --filter @codaco/sketch   # http://localhost:5186
```

The `[dev]` block in `netlify.toml` serves `netlify dev` on
`http://localhost:5186` and moves Vite to an inner port (5187), so the page
keeps the one origin a development build of Architect accepts.

To try the Architect handoff locally, run Architect's dev server and start
Sketch with `VITE_ARCHITECT_URL=http://localhost:5173 npx netlify dev --filter
@codaco/sketch`. A development build of Architect accepts
`http://localhost:5186`; a production build does not.

Tests, typecheck and build:

```sh
pnpm --filter @codaco/sketch test
pnpm --filter @codaco/sketch typecheck
pnpm --filter @codaco/sketch build
```

All tests use fake provider adapters (`src/server/__tests__/fakes.ts`). No test
calls a real model. `src/server/__tests__/end-to-end.test.ts` runs the whole
round trip: it creates a job, runs it, polls it, then reads the `.netcanvas`
back with `extractProtocol` and validates it.

## Environment variables

| Variable                  | Where        | Default                                  | What                                                                                                             |
| ------------------------- | ------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | functions    | none                                     | Enables the Claude provider. Without it the provider shows as unavailable.                                       |
| `OPENAI_API_KEY`          | functions    | none                                     | Enables the ChatGPT provider.                                                                                    |
| `OPENAI_DESIGN_MODEL`     | functions    | `gpt-6-astra`                            | OpenAI model for step 2 (both tiers).                                                                            |
| `OPENAI_WORDING_MODEL`    | functions    | `gpt-6-luna`                             | OpenAI model for steps 1 and 3.                                                                                  |
| `SKETCH_DAILY_BUDGET_USD` | functions    | `20`                                     | New jobs are refused (HTTP 429) once today's recorded spend (UTC day) reaches this.                              |
| `SKETCH_PRICING`          | functions    | built-in table in `src/server/models.ts` | JSON `{"<model>": {"input", "output", "cacheRead", "cacheWrite"}}` in USD per million tokens; overrides entries. |
| `VITE_ARCHITECT_URL`      | build (Vite) | `https://architect.networkcanvas.dev`    | Where "Open in Architect" goes. Baked into the bundle at build time.                                             |

Anthropic models are fixed in code: Sonnet 5.5 designs on the standard tier,
Opus 5.5 on the strong (compare) tier, Haiku 5.5 screens and writes wording.
The built-in OpenAI prices are unverified; set `SKETCH_PRICING` once they are
confirmed.

## Provisioning the Netlify site (manual)

The `sketch-networkcanvas` site was created this way on 2026-10-20. To
recreate it:

1. In Netlify, create a site from `complexdatacollective/network-canvas-monorepo`
   named `sketch-networkcanvas` (so `sketch-networkcanvas.netlify.app` and its
   deploy previews match Architect's origin allowlist).
2. Set the **base directory** to the repository root and the **config file**
   (package path) to `apps/sketch/netlify.toml`. The file sets the build
   command, publish directory (`apps/sketch/dist`) and functions directory
   (`apps/sketch/netlify/.bundled`, written by `scripts/bundle-functions.mjs`
   after the build).
3. Add the environment variables above. Mark the API keys as secret and
   scope them to Functions.
4. Netlify Blobs needs no setup: the functions create the `sketch-jobs` and
   `sketch-log` stores on first use.
5. Add the custom domain `sketch.networkcanvas.com` (production) and/or
   `sketch.networkcanvas.dev`. Any other host must be added to
   `apps/architect/src/config/sketchOrigins.ts` and released in Architect
   before the handoff works from it.
6. Make sure the Architect that `VITE_ARCHITECT_URL` points at has shipped the
   `/import-from-sketch` route.

Deploy previews skip the build when nothing Sketch depends on changed (the
`ignore` command in `netlify.toml`).

## Cost guards

- **Daily budget.** `POST /api/jobs` refuses new jobs once the day's spend in
  `sketch-jobs` under `spend/<YYYY-MM-DD>` reaches `SKETCH_DAILY_BUDGET_USD`.
  Spend is added when a job finishes, priced from the token usage each call
  reports. This is a soft guard: jobs that are already running are not
  stopped, so concurrent jobs can overshoot the limit by a few jobs' cost, and
  two jobs finishing at the same instant can lose an increment.
- **Rate limits.** Netlify rate-limits `POST /api/jobs` to 4 requests a minute
  and `POST /api/preference` to 20 a minute, per IP and domain.
- **Bounded calls.** One design retry at most. Output is capped at 16,000
  tokens for the design, 8,000 for wording and 1,000 for screening, and each call
  has a timeout. A truncated (`max_tokens`) answer counts as a failed attempt.
- **Prompt caching.** The system prompts and JSON schemas are byte-stable, so
  repeated jobs hit the providers' prompt caches.
- **Unknown models** are priced like the most expensive known one, so the
  budget errs on the side of stopping.
- **No StrictMode** in the page: its doubled effects would start every job
  twice in development.

## Logging

Each finished job writes one entry to the `sketch-log` Blobs store under
`log/<YYYY-MM-DD>/<jobId>`: the description, provider, tier, models, status,
error, token usage, cost and duration, plus the pipeline's own record. That
record holds the screening result, every design attempt with its raw text and
issues, the retry feedback, the wording, validity, tags (`wordingFailed`,
`salvaged`, `compilerBug`, …) and per-call usage. Compare runs share a
`comparisonId`. The researcher's pick is stored under
`preference/<comparisonId>` and on the preferred job's entry.

Job records (with the generated protocol) live in `sketch-jobs` under
`jobs/<jobId>` (e.g. `npx netlify blobs:get sketch-jobs jobs/<jobId>`). Neither store expires anything automatically.

To export the log with the Netlify CLI, from a directory linked to the site:

```sh
npx netlify blobs:list sketch-log --prefix log/2026-10-20/ --json
npx netlify blobs:get sketch-log log/2026-10-20/<jobId> > entry.json
```

To dump a whole day, loop over the keys:

```sh
day=2026-10-20
npx netlify blobs:list sketch-log --prefix "log/$day/" --json \
  | node -e 'for (const b of JSON.parse(require("fs").readFileSync(0)).blobs) console.log(b.key)' \
  | while read -r key; do npx netlify blobs:get sketch-log "$key"; echo; done > "sketch-log-$day.jsonl"
```

Descriptions are researchers' own text. Treat the log as research data, and
tell users that what they type is stored.

## Known limitations

- **No live provider test yet.** No API keys have been used. OpenAI strict mode
  with this schema (`$ref` inside `anyOf`, single-value `enum`
  discriminators), OpenAI's schema size limits and Anthropic's grammar compile
  time are unverified. Run a smoke test against both providers before
  launch.
- **Output size.** A design is roughly 3–4k output tokens, because every stage
  repeats a full `skipLogic` and most repeat a `filter`.
- **`single_choice` compiles to categorical with `maxSelected: 1`.** The widgets
  are multi-select, so a participant can tap two options and then see a
  validation error.
- **Repairs drop rather than guess.** A degraded design loses the pieces that
  could not be repaired. The researcher-notes stage and the compare screen's
  `fixedIssues` say what changed.
- **Validated instruments come from model memory.** Wording never changes
  them, but the model can misremember items or scores. The researcher-notes
  stage flags this.
- **Geospatial works at country level only**, with a bundled 212 KB world map
  and the testing Mapbox token, which does not work on Fresco deployments and
  must be replaced there.
- **Skip logic cannot count.** "Fewer than 2 friends" cannot be expressed; the
  automatic skip covers "nobody named" only, so a dyad census with one alter
  shows one empty screen.
- **Some runtime behaviour has been checked by reading code, not by running an
  interview:** the automatic `NOT_EXISTS` skip, Narrative `automaticLayout`
  from the preceding sociogram, Toggle highlights, roster header mapping, and
  ordinal `INCLUDES`. Run the Interviewer e2e suite on the example and
  coverage protocols before launch.
- **Names are unique** (the template convention), so two friends called Alex
  must be told apart by nickname.
- **v1.1 design flags are recipes, not code.**
- **`generate-background` is publicly reachable** at
  `/.netlify/functions/generate-background`. It only runs jobs that are still
  queued, so a stray call cannot start new spend, but it is not authenticated.
