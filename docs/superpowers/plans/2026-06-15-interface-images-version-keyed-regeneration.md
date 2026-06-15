# Interface images — version-keyed regeneration + build-time wiring

**Context.** Today the generated interface screenshots are committed blobs gated by a
Docker staleness check that (a) re-runs on _every_ interview/fresco-ui content change and
(b) requires a manual regenerate-and-commit. We want the opposite: regeneration is an
explicit, deliberate act tied to the **`@codaco/interview` release version** (current, or
pending via a changeset), the images are turbo-cached rather than committed, and a version
bump reliably flows fresh images into the architect-web and documentation deploys.

Accepted trade-off: between version bumps the cached images can be stale relative to the
code. **Chromatic already snapshots the `capture` stories**, so a rendering change shows up
as a visual diff in the PR — that's the human-in-the-loop prompt to add the interview
changeset. Chromatic-on-capture-stories must be a watched/required signal for this to be safe.

## Design

1. **Decouple `generate`'s hash from interview/fresco-ui content.** Remove
   `dependsOn: ["@codaco/interview#build-storybook"]` from `@codaco/interface-images#generate`
   (turbo's `dependsOn` feeds both ordering _and_ the hash; we want neither here). The
   `generate` script builds Storybook itself when it runs.
2. **Key `generate` on the interview release version.** Add `INTERVIEW_RELEASE_VERSION` to the
   task's `env`. Value = pending version from `changeset status` if a changeset bumps
   `@codaco/interview`, else the current `packages/interview/package.json` version. Scope: the
   key is **interview-only** (a fresco-ui visual change requires an interview changeset;
   Chromatic flags it). Folding in fresco-ui's version later is a one-line addition.
3. **Build-time generation.** `@codaco/architect-web#build` and `@codaco/documentation#build`
   gain `dependsOn: ["^build", "@codaco/interface-images#generate"]`, so a changed version key
   propagates into both consumer builds.
4. **Cache, don't commit.** `git rm --cached` the `src/generated/assets/**` webp and gitignore
   them (turbo `outputs` already caches them). **Keep `manifest.ts` committed** — it's a tiny
   text file referenced for types, so typecheck/knip/lint/IDE keep working with no extra turbo
   edges; only `build` needs the webp.
5. **Delete now-dead machinery.** The churn guard in `process.mts` (pixelmatch, `DIFF_THRESHOLD`,
   the `NameGeneratorRoster` override), the committed-baseline comparison, and the Docker
   requirement in `run-docker.sh` all go — nothing diffs against a committed reference anymore,
   so host non-determinism is irrelevant.

## CI wiring (the reverse-scenario guarantee)

`detect` job gains:

- `interview_release_version` output — computed once (via `scripts/interview-release-version.mjs`)
  and **fanned out** as `env:` to every job whose turbo graph contains `generate`: `quality`
  (which builds the apps) and the four deploy jobs. Turbo hashes this env per task; if it differs
  between jobs the cache misses, so it must be identical everywhere.
- `interface_images` is computed (`true` when the interview package version field changed, **or**
  a `.changeset/*.md` affecting `@codaco/interview` was added/changed/removed) and **folded into
  the base `docs` and `architect` flags** (`ifimg=true ⇒ docs=true; arch=true`). This keeps the
  one-flag-per-job invariant the `carry-forward-statuses` job relies on, so deploys, docs-preview
  checks, and `any_app` all treat a moved interview version as a change to both apps with no
  special-casing.

Then:

- `interface-images-check` (the Docker staleness gate) is **deleted** — there is no committed
  reference to diff against. `generate` instead runs inside the **`quality`** job (it already
  builds architect-web + documentation, which depend on `generate`); `quality` gains a Chromium
  install + the Mapbox secret + `INTERVIEW_RELEASE_VERSION`, and fills the shared `.turbo` cache.
- `deploy-docs-{preview,prod}` and `deploy-architect-{preview,prod}` keep their existing
  `docs`/`architect` gates (now inclusive of the interview-version signal), set
  `INTERVIEW_RELEASE_VERSION` so their `generate` hash matches, and read `generate`'s output back
  from quality's `.turbo` cache (no Chromium of their own).

**Reverse scenario, end to end:** interview is versioned (changeset added, or release bump) →
`detect` folds it into `docs` + `architect` **and** `INTERVIEW_RELEASE_VERSION` moves →
`generate` regenerates once in `quality` → `architect-web#build`/`documentation#build` hashes
change (they depend on `generate`) → both deploy jobs run and ship the fresh images.

## Files

- `turbo.json` — `generate` task (drop storybook dep, add env); `architect-web#build`,
  `documentation#build` (+`generate` dep); add `architect-web#typecheck` if needed (manifest is
  committed, so likely not).
- `packages/interface-images/package.json` — `generate` script builds Storybook internally.
- `packages/interface-images/scripts/{generate,process,config}.mts` — remove churn guard +
  overrides; build-storybook orchestration.
- `packages/interface-images/scripts/run-docker.sh` — demote to optional local convenience or delete.
- `.gitignore` + `git rm --cached packages/interface-images/src/generated/assets/**`.
- `.github/workflows/ci-and-release.yml` — `detect` outputs; warming job; deploy `if:` + `needs:`.
- **README** (see below).

## README

Update the root `README.md` (and `packages/interface-images/README.md`) to document, fully:
the purpose of the pipeline; that images are **turbo-cached, not committed** (only `manifest.ts`
is committed); that regeneration is triggered **only by the `@codaco/interview` release version**
(add a changeset bumping `@codaco/interview`, or bump the version) — not by arbitrary
interview/fresco-ui edits; the explicit staleness trade-off and that **Chromatic on the capture
stories** is the signal that you _should_ add a changeset; how to regenerate locally
(`pnpm generate:interface-images`, needs Chromium + `STORYBOOK_MAPBOX_TOKEN`); and the CI flow
(warming job → consumer builds → deploys) including the reverse-scenario guarantee.

## Verification

- `turbo run build --filter=@codaco/documentation --dry=json` shows `generate` in the task graph;
  `--dry` hash is stable across an unrelated edit and changes when `INTERVIEW_RELEASE_VERSION` /
  the interview version moves.
- Local: regenerate with the version unchanged → cache hit (no Chromium run); add an interview
  changeset → `changeset status` reports the pending version → cache miss → regenerate.
- Push a branch that bumps the interview version and confirm on the real runner that **both**
  `deploy-docs-preview` and `deploy-architect-preview` run with regenerated images; push an
  unrelated change and confirm neither regenerates.
