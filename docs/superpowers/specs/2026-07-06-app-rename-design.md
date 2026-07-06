# App rename: architect-web → architect, interviewer-v8 → interviewer (classic apps → \*-classic)

**Date:** 2026-07-06
**Status:** Design — awaiting review

## Goal

Rename four apps in the monorepo so the new web PWAs take the primary names and the
legacy Electron apps are marked `-classic`, updating **every** in-repo reference —
source, package metadata, workspace config, CI/release machinery, docs, and
in-repo user-facing display text.

## The rename map (authoritative)

| Current dir                           | New dir                    | Current package              | New package                   |
| ------------------------------------- | -------------------------- | ---------------------------- | ----------------------------- |
| `apps/architect` (classic Electron)   | `apps/architect-classic`   | `network-canvas-architect`   | `@codaco/architect-classic`   |
| `apps/interviewer` (classic Electron) | `apps/interviewer-classic` | `network-canvas-interviewer` | `@codaco/interviewer-classic` |
| `apps/architect-web` (PWA)            | `apps/architect`           | `@codaco/architect-web`      | `@codaco/architect`           |
| `apps/interviewer-v8` (PWA)           | `apps/interviewer`         | `@codaco/interviewer-v8`     | `@codaco/interviewer`         |

Both classic apps are re-scoped from the legacy unscoped `network-canvas-*`
convention to `@codaco/*-classic` (decision below).

## Decisions

1. **Scope = internal identifiers + in-repo user-facing display text.** Directory
   names, `package.json` names, imports, CI/turbo/changeset machinery, **and**
   displayed strings (`<title>`, PWA manifest, Electron `productName`, in-UI copy,
   docs prose) all change.
2. **Classic apps re-scoped to `@codaco/*-classic`** (not left as `network-canvas-*`).
3. **CI job names are renamed** for consistency (e.g. `deploy-interviewer-v8-preview`
   → `deploy-interviewer-preview`). These double as branch-protection required
   checks, so the required-check names must be re-pointed in GitHub repo settings
   after merge (external follow-up).
4. **PWA runtime keys: clean break.** The interviewer app hard-codes `interviewer-v8`
   as a _value_ in runtime persistence/crypto; all of these are renamed to
   `interviewer`. This deliberately **resets local data for existing `interviewer-v8`
   beta installs**: the IndexedDB database is recreated empty, previously-encrypted
   vaults become undecryptable, enrolled passkeys stop matching, and PostHog history
   splits. Accepted as intended; no data migration is written. Documented in the
   changeset and RELEASING notes.
5. **Classic Electron distribution identity: keep.** Electron `appId`,
   electron-builder `repo:` publish targets, and any classic keychain/keystore tags
   are left unchanged so existing desktop installs keep auto-updating. Only the
   classic apps' user-visible `productName`/titles gain "Classic".

## Approach

One atomic branch and PR. A phased split is impossible — the new names collide with
the classic apps' current names, so the `-classic` renames must land in the same
change that frees those names. Replacement is done with **exact full identifiers,
never bare-word substring swaps**, because of overlapping strings (see Hazards).

### Execution order

1. **Move directories with `git mv`** (frees each colliding name before reuse):
   1. `apps/architect` → `apps/architect-classic`
   2. `apps/interviewer` → `apps/interviewer-classic`
   3. `apps/architect-web` → `apps/architect`
   4. `apps/interviewer-v8` → `apps/interviewer`
2. **Package identity:** the four `package.json` `name` fields; classic-architect's
   workspace dependency on the classic interviewer
   (`network-canvas-interviewer` → `@codaco/interviewer-classic`); the
   `require.resolve("network-canvas-interviewer/...")` in
   `architect-classic/public/components/createPreviewWindow.js`.
3. **Root config & release machinery:** `turbo.json` (4 package-scoped task keys),
   `.changeset/config.json` (ignore list), `knip.json` (dir-path and package-name
   entries), `scripts/changeset-app-utils.mjs`, `scripts/mirror-app.mjs`,
   `scripts/release-notes.mjs`, `scripts/interview-release-version.mjs`, and the
   co-located `*.test.mjs` fixtures that assert these names.
4. **CI / GitHub:** `.github/workflows/ci-and-release.yml` (detect outputs, `flag`
   vars, `--filter`, `--dir`, `PKG_JSON`/`PKG_NAME`, `tag_name`, job **names**,
   `needs:` references, PR-comment strings, and the **classic** Electron
   build/release jobs — all classic refs move to the new dir/package names too);
   `.github/workflows/legacy-app-build.yml` (matrix values → `architect-classic` /
   `interviewer-classic`, filter `@codaco/${{ matrix.app }}`, working-directory and
   artifact paths); `.github/scripts/detect-app-release.sh`; `.github/dependabot.yml`
   (`apps/architect/**` → `apps/architect-classic/**`, etc.).
5. **In-repo user-facing display text:**
   - New apps: `<title>Architect Web</title>` → `Architect`;
     `<title>Network Canvas Interviewer 8</title>` → `Network Canvas Interviewer`;
     in-UI "Network Canvas Interviewer 8" strings (onboarding, settings, analytics
     step) → "Network Canvas Interviewer"; README/RELEASING headings drop "Web"/"v8".
   - Classic apps: `productName`, Electron window titles, `<title>`, welcome/updater/
     dialog/error strings → "… Classic" (e.g. "Network Canvas Architect Classic").
   - **Two display-text judgment calls:** (a) the classic interviewer's protocol-
     version error ("Upgrade the protocol using **Architect**, and try importing it
     again") keeps "Architect" unqualified — it directs users to the current Architect,
     not the classic one. (b) The new apps' PWA `manifest.name` (`Network Canvas
Architect` / `Network Canvas Interviewer`) is already correct and stays as-is;
     only `<title>` and headings that literally contain "Web"/"8"/"v8" change.
6. **PWA runtime keys (interviewer only, clean break):** IndexedDB name
   (`super('interviewer-v8')`), vault storage key (`interviewer-v8:vault` + export),
   HKDF info (`interviewer-v8-dek-wrap`), WebAuthn RP name, installation-id key,
   install-banner dismiss key, PostHog instance name, and the `app`/`hostApp`/
   `commitHash` analytics values → `interviewer`; update matching test fixtures
   (`InstallBanner.test.tsx`, `vaultStore.test.ts`) in lockstep.
7. **Docs & skills:** `README.md`, `CLAUDE.md`, `.claude/skills/*` (developing-in-
   network-canvas, creating-a-changeset, creating-a-network-canvas-interface),
   `apps/documentation/public/sidebar.json`, and prose in `docs/*.md`.
8. **Regenerate & verify** (see Verification).

## Explicit carve-outs (do NOT change)

- **App Store URL** `…/app/network-canvas-interviewer/id1538673677` — external identity.
- **Architect installation-id key** `network-canvas-architect-installation-id` — already
  reads "architect"; matches the new name, so no change (reject the inventory's
  backwards "add `-web`" suggestion).
- **Classic `appId`, electron-builder `repo:`, and keystore tags** (e.g. the
  `network-canvas-interviewer.dek` tag in the biometric-keystore design doc) — per
  decision 5.
- **Workbox `cacheName`s** (`architect-images`, `architect-bundled-assets`,
  `interviewer-images`, `interviewer-fonts`) — internal cache names; the architect
  ones already read "architect". Leave (cache reset on next deploy is a non-issue and
  not needed for the rename).
- **The `@codaco/interview` library** — a different package; never rewrite to
  `@codaco/interviewer`.
- **`needs.detect.outputs.architect`** — the detect key is already `architect`;
  only the `interviewer_v8` detect key/var is renamed to `interviewer`.

## Substring hazards (replacement rules)

- `@codaco/interview` is a prefix of the new `@codaco/interviewer` — match on the
  exact full package specifier, never a bare `interviewer` grep-and-replace. The
  existing "substring of @codaco/interviewer-v8" guard comments update to reference
  `@codaco/interviewer` and the guard logic stays.
- Bare `architect` / `interviewer` appear inside `NETLIFY_SITE_ID_ARCHITECT`,
  `Network-Canvas-Interviewer-6`, job names, and paths. Replace by exact context, not
  by word.
- Do the `-classic` directory moves before the `-web`/`-v8` moves so no path is ever
  ambiguous.

## Verification

1. `pnpm install` — regenerate `pnpm-lock.yaml`, confirm the workspace resolves all
   four renamed packages and classic-architect ↔ classic-interviewer link.
2. `pnpm typecheck` (all packages).
3. Targeted build of each renamed app plus classic-architect (which vendors the
   classic interviewer preview host).
4. `pnpm knip` (quality gate — sensitive to package/dir names).
5. `pnpm lint` / `oxfmt` on modified files.
6. `node --test scripts/*.test.mjs` — the changeset/version/isolation script tests.
7. **Final grep sweep** for stale `architect-web`, `interviewer-v8`,
   `network-canvas-architect`, `network-canvas-interviewer` across the repo; every
   remaining hit must be an intentional carve-out.
8. Changeset: author app changesets under the **new** names (`@codaco/architect`,
   `@codaco/interviewer`) via the `creating-a-changeset` skill, noting the
   interviewer local-data reset. Never mix app and library in one changeset.

## External follow-ups (out of repo — the user does these)

- Re-point GitHub **branch-protection required status checks** to the renamed CI job
  names (merges block until this is done).
- Netlify: the deploy **site slugs / production URLs** are user-facing but live in the
  Netlify dashboard, not the repo. Site IDs (`NETLIFY_SITE_ID_ARCHITECT`,
  `NETLIFY_SITE_ID_INTERVIEWER`) are unchanged, so CI keeps working; renaming the
  public URL is optional and manual.
- Classic standalone release repos (`repo: 'architect'` / `'interviewer'`) are left
  as-is per decision 5; no GitHub-side action needed.

## Risks

- **Missed reference → broken build.** Mitigated by the exhaustive inventory (328
  findings, 8 categories) plus the final grep sweep.
- **Interviewer beta data reset** (decision 4) — intended, but must be called out in
  the changeset/RELEASING so it isn't a surprise on the next beta deploy.
- **Lockfile churn** — package renames rewrite many `pnpm-lock.yaml` entries; expected.
