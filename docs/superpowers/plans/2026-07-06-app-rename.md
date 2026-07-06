# Four-App Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `architect-web`→`architect`, `interviewer-v8`→`interviewer`, and the legacy `architect`/`interviewer` Electron apps→`architect-classic`/`interviewer-classic`, updating every in-repo reference (source, package metadata, workspace/CI/release machinery, docs, and in-repo user-facing display text).

**Architecture:** One atomic branch/PR. `git mv` the four directories in a collision-safe order (classic→`-classic` first, freeing names for web/v8), then rewrite identifiers using **exact, delimiter-bounded** matches — never bare-word substring swaps. Verify with `pnpm install` + typecheck + targeted builds + knip + a final grep sweep.

**Tech Stack:** pnpm workspace, turbo, changesets, Vite/`vite-plugin-pwa` (new apps), electron-builder (classic apps), Vitest, GitHub Actions, Netlify CLI, knip, oxlint/oxfmt.

## Global Constraints

- **Canonical rename map** (the only four logical renames; every edit derives from this):

  | old dir               | new dir                    | old package                  | new package                   |
  | --------------------- | -------------------------- | ---------------------------- | ----------------------------- |
  | `apps/architect`      | `apps/architect-classic`   | `network-canvas-architect`   | `@codaco/architect-classic`   |
  | `apps/interviewer`    | `apps/interviewer-classic` | `network-canvas-interviewer` | `@codaco/interviewer-classic` |
  | `apps/architect-web`  | `apps/architect`           | `@codaco/architect-web`      | `@codaco/architect`           |
  | `apps/interviewer-v8` | `apps/interviewer`         | `@codaco/interviewer-v8`     | `@codaco/interviewer`         |

- **Ordering rule (per file and globally):** rewrite the **classic** tokens (`apps/architect`→`apps/architect-classic`, `network-canvas-*`→`@codaco/*-classic`) **before** the web/v8 tokens that claim the freed names. Otherwise you create ambiguous duplicate names.
- **Delimiter rule:** `apps/architect` is a prefix of `apps/architect-web`; `apps/interviewer` of `apps/interviewer-v8`; `@codaco/interview` (a real, different library) of `@codaco/interviewer`. NEVER replace these as bare substrings. Only replace an occurrence bounded by a delimiter (`/ " ' # ` ` `, whitespace, `)`, EOL). When using the Edit tool, include enough surrounding text to make `old_string` unique; prefer per-file `replace_all` only on a **full** distinct identifier (e.g. `@codaco/architect-web`), never on a bare prefix.
- **Never touch the `@codaco/interview` library** — it is `packages/interview`, unrelated to the interviewer app.
- **Carve-outs — do NOT change (verified intentional):**
  - App Store URL `https://apps.apple.com/us/app/network-canvas-interviewer/id1538673677` (in `apps/interviewer-classic/src/hooks/useUpdater.jsx` and `.../__test__/useUpdater.test.js`).
  - `apps/architect/src/analytics.ts` `INSTALLATION_ID_KEY = 'network-canvas-architect-installation-id'` — already reads "architect"; leave.
  - Classic Electron `appId` and electron-builder `repo:` in `apps/architect-classic/electron-builder.config.js` and `apps/interviewer-classic/electron-builder.config.cjs`; and the `network-canvas-interviewer.dek` keystore tag in `docs/superpowers/plans/2026-05-28-biometric-keystore-unlock.md`.
  - Workbox `cacheName`s (`architect-images`, `architect-bundled-assets`, `interviewer-images`, `interviewer-fonts`).
  - `needs.detect.outputs.architect` (detect key already `architect`); only the `interviewer_v8` detect key/var renames.
  - PWA `manifest.name` values (`Network Canvas Architect` / `Network Canvas Interviewer`) — already correct.
- **Display-text judgment calls:** classic interviewer's error "Upgrade the protocol using **Architect**…" keeps "Architect" unqualified. Classic apps' own name strings gain "Classic".
- **Commit style:** small commits per task; feature branch only; no `Co-Authored-By`.
- After edits, formatter runs via lint-staged/pre-commit — do not hand-run oxfmt/oxlint per file.

---

### Task 1: Move directories and rewrite package identity

**Files:**

- Move (git mv): the four `apps/*` directories per the map.
- Modify: `apps/architect-classic/package.json`, `apps/interviewer-classic/package.json`, `apps/architect/package.json`, `apps/interviewer/package.json`, `apps/architect-classic/public/components/createPreviewWindow.js`.

**Interfaces:**

- Produces: the four new package names + dirs that every later task references. New workspace graph: `@codaco/architect-classic` depends on `@codaco/interviewer-classic` (`workspace:*`).

- [ ] **Step 1: Move directories (classic first, then web/v8)**

```bash
git mv apps/architect apps/architect-classic
git mv apps/interviewer apps/interviewer-classic
git mv apps/architect-web apps/architect
git mv apps/interviewer-v8 apps/interviewer
```

- [ ] **Step 2: Rewrite the four `package.json` `name` fields (+ classic productName + repo directory)**

- `apps/architect-classic/package.json`: `"name": "network-canvas-architect"` → `"name": "@codaco/architect-classic"`; `"productName": "Network Canvas Architect"` → `"productName": "Network Canvas Architect Classic"`; dependency `"network-canvas-interviewer": "workspace:*"` → `"@codaco/interviewer-classic": "workspace:*"`.
- `apps/interviewer-classic/package.json`: `"name": "network-canvas-interviewer"` → `"name": "@codaco/interviewer-classic"`; `"productName": "Network Canvas Interviewer"` → `"productName": "Network Canvas Interviewer Classic"`.
- `apps/architect/package.json`: `"name": "@codaco/architect-web"` → `"name": "@codaco/architect"`.
- `apps/interviewer/package.json`: `"name": "@codaco/interviewer-v8"` → `"name": "@codaco/interviewer"`; if a `repository.directory` of `"apps/interviewer-v8"` exists → `"apps/interviewer"`.

- [ ] **Step 3: Fix the classic-architect → classic-interviewer runtime resolve**

`apps/architect-classic/public/components/createPreviewWindow.js`: `require.resolve("network-canvas-interviewer/package.json")` → `require.resolve("@codaco/interviewer-classic/package.json")`. Also update the two comment references to `network-canvas-interviewer` in that file and in `apps/architect-classic/scripts/dev.mjs` and `apps/architect-classic/electron-builder.config.js` (comment on line ~35) → `@codaco/interviewer-classic`.

- [ ] **Step 4: Regenerate the lockfile and verify workspace resolution**

Run: `pnpm install --no-frozen-lockfile`
Expected: install succeeds; `pnpm ls --filter @codaco/architect-classic` shows the `@codaco/interviewer-classic` workspace link; no "unmatched" package errors.

- [ ] **Step 5: Verify all four packages are recognised by turbo**

Run: `pnpm exec turbo ls`
Expected: lists `@codaco/architect`, `@codaco/interviewer`, `@codaco/architect-classic`, `@codaco/interviewer-classic`; no `@codaco/architect-web` / `@codaco/interviewer-v8` / `network-canvas-*`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move app directories and rename packages"
```

---

### Task 2: Root config & release-script machinery

**Files:**

- Modify: `turbo.json`, `.changeset/config.json`, `knip.json`, `scripts/changeset-app-utils.mjs`, `scripts/mirror-app.mjs`, `scripts/release-notes.mjs`, `scripts/interview-release-version.mjs`.
- Test: `scripts/changeset-app-utils.test.mjs`, `scripts/check-changeset-app-isolation.test.mjs`, `scripts/version-beta-apps.test.mjs`.

**Interfaces:**

- Consumes: new package names/dirs from Task 1.
- Produces: `APP_PACKAGES = ['@codaco/architect', '@codaco/interviewer']` and dir map `{ '@codaco/architect': 'apps/architect', '@codaco/interviewer': 'apps/interviewer' }` in `scripts/changeset-app-utils.mjs`, relied on by the CI release jobs (Task 4).

- [ ] **Step 1: `turbo.json` — rewrite the four package-scoped task keys**

Apply classic first, then web (delimiter-bounded on the `#`):

- `"network-canvas-architect#build"` → `"@codaco/architect-classic#build"`
- `"network-canvas-interviewer#build:web"` → `"@codaco/interviewer-classic#build:web"`
- `"@codaco/architect-web#build"` → `"@codaco/architect#build"`
- `"@codaco/architect-web#dev"` → `"@codaco/architect#dev"`

- [ ] **Step 2: `.changeset/config.json` — rewrite the four ignore-list entries**

`"@codaco/architect-web"`→`"@codaco/architect"`, `"@codaco/interviewer-v8"`→`"@codaco/interviewer"`, `"network-canvas-architect"`→`"@codaco/architect-classic"`, `"network-canvas-interviewer"`→`"@codaco/interviewer-classic"`.

- [ ] **Step 3: `knip.json` — rewrite dir-path and package-name entries (classic first)**

Open the file and edit each exact key (they are distinct strings): `"apps/architect"`→`"apps/architect-classic"`, `"apps/interviewer"`→`"apps/interviewer-classic"`, `"network-canvas-interviewer"`→`"@codaco/interviewer-classic"` (every occurrence in the config array), THEN `"apps/architect-web"`→`"apps/architect"`, `"apps/interviewer-v8"`→`"apps/interviewer"`. Use exact `"…"`-quoted `old_string`s so `apps/architect` never matches inside `apps/architect-web`.

- [ ] **Step 4: `scripts/*.mjs` — rewrite the release machinery**

- `scripts/changeset-app-utils.mjs`: `APP_PACKAGES = ['@codaco/architect-web', '@codaco/interviewer-v8']` → `['@codaco/architect', '@codaco/interviewer']`; `'@codaco/architect-web': 'apps/architect-web'` → `'@codaco/architect': 'apps/architect'`; `'@codaco/interviewer-v8': 'apps/interviewer-v8'` → `'@codaco/interviewer': 'apps/interviewer'`.
- `scripts/mirror-app.mjs`: `if (appName === 'network-canvas-architect')` → `if (appName === '@codaco/architect-classic')`. **Re-read the whole file** and give the same treatment to any `network-canvas-interviewer`, `apps/architect`, or `apps/interviewer` occurrences (classic mirror logic), applying the classic→`-classic` map.
- `scripts/release-notes.mjs`: comment `'network-canvas-architect': patch` → `'@codaco/architect-classic': patch`.
- `scripts/interview-release-version.mjs`: comment `substring of @codaco/interviewer-v8` → `substring of @codaco/interviewer`.

- [ ] **Step 5: Update the three script test fixtures to the new names**

In `scripts/changeset-app-utils.test.mjs`, `scripts/check-changeset-app-isolation.test.mjs`, and `scripts/version-beta-apps.test.mjs`: replace every `@codaco/architect-web`→`@codaco/architect`, `@codaco/interviewer-v8`→`@codaco/interviewer`, `apps/architect-web`→`apps/architect`, `apps/interviewer-v8`→`apps/interviewer`. (`check-changeset-app-isolation.test.mjs` keeps its `@codaco/interview` line — that's the library, unchanged.)

- [ ] **Step 6: Run the script tests**

Run: `node --test scripts/changeset-app-utils.test.mjs scripts/check-changeset-app-isolation.test.mjs scripts/version-beta-apps.test.mjs`
Expected: all pass.

- [ ] **Step 7: Run knip**

Run: `pnpm knip`
Expected: no new errors attributable to package/dir names (a clean run, or only pre-existing ignored entries).

- [ ] **Step 8: Commit**

```bash
git add turbo.json .changeset/config.json knip.json scripts/
git commit -m "refactor: update turbo/changeset/knip/release-script machinery for renamed apps"
```

---

### Task 3: CI workflows & GitHub machinery

**Files:**

- Modify: `.github/workflows/ci-and-release.yml`, `.github/workflows/legacy-app-build.yml`, `.github/scripts/detect-app-release.sh`, `.github/dependabot.yml`.

**Interfaces:**

- Consumes: new package names/dirs (Task 1), `APP_PACKAGES` map (Task 2).
- Produces: renamed CI job ids (`deploy-interviewer-preview`, unchanged `deploy-architect-preview`) that branch protection must be re-pointed to (external follow-up).

- [ ] **Step 1: `ci-and-release.yml` — PWA app references (new apps)**

Within this file, `replace_all` the full identifiers: `@codaco/architect-web`→`@codaco/architect`, `@codaco/interviewer-v8`→`@codaco/interviewer`, `apps/architect-web`→`apps/architect`, `apps/interviewer-v8`→`apps/interviewer`. Then rename the interviewer preview job and its wiring: `deploy-interviewer-v8-preview`→`deploy-interviewer-preview` (the `job id`, and every `needs:`/dependency-string occurrence, including the `always()`/`success()` expression and the `needs: [ … ]` lists); detect output `interviewer_v8`→`interviewer` (the `outputs:` line, the `steps.flags.outputs.interviewer_v8` ref, `echo "interviewer_v8=…"`, and `needs.detect.outputs.interviewer_v8`); shell var `intv8`→`intv`; env `INTERVIEWER_V8_URL`→`INTERVIEWER_URL` and `FLAG_INTERVIEWER_V8`→`FLAG_INTERVIEWER`; and the PR-comment/`name:`/comment strings that read `architect-web`/`interviewer-v8` → `architect`/`interviewer` (or "Architect"/"Interviewer" where a display label). Leave `needs.detect.outputs.architect`, `NETLIFY_SITE_ID_ARCHITECT`, `NETLIFY_SITE_ID_INTERVIEWER` unchanged.

- [ ] **Step 2: `ci-and-release.yml` — classic app references**

In the classic Electron build/release jobs, apply the classic map (delimiter-bounded, classic before any remaining web token): `network-canvas-architect`→`@codaco/architect-classic`, `network-canvas-interviewer`→`@codaco/interviewer-classic`, `apps/architect`→`apps/architect-classic`, `apps/interviewer`→`apps/interviewer-classic` (in `--filter`, `--pkg`, `working-directory`, `PKG_JSON`, and artifact paths). Confirm no `apps/architect` occurrence remains that actually means the new PWA (those were already `apps/architect` after Step 1 — take care: do Step 2's `apps/architect`→`apps/architect-classic` ONLY on the classic-job blocks, matching with the classic job's surrounding context, not globally). If uncertain, edit each classic-job occurrence individually.

- [ ] **Step 3: `legacy-app-build.yml` — matrix + filter + paths**

- Matrix `app: [architect, interviewer]` → `app: [architect-classic, interviewer-classic]`.
- Build filter `--filter=network-canvas-${{ matrix.app }}` → `--filter=@codaco/${{ matrix.app }}`.
- The comment referencing `network-canvas-interviewer` / `apps/interviewer/out` → `@codaco/interviewer-classic` / `apps/interviewer-classic/out`.
- `working-directory: apps/${{ matrix.app }}` and the `apps/${{ matrix.app }}/release-builds/*` artifact globs already resolve correctly via the new matrix values — leave the `${{ matrix.app }}` interpolations as-is.

- [ ] **Step 4: `detect-app-release.sh` and `dependabot.yml`**

- `.github/scripts/detect-app-release.sh`: comment `architect-web / interviewer-v8` → `architect / interviewer`.
- `.github/dependabot.yml`: comment `apps/architect, apps/interviewer` → `apps/architect-classic, apps/interviewer-classic`; path `- 'apps/architect/**'` → `- 'apps/architect-classic/**'`; path `- 'apps/interviewer/**'` → `- 'apps/interviewer-classic/**'`.

- [ ] **Step 5: Lint the workflow YAML (if actionlint available) and grep-verify**

Run: `command -v actionlint >/dev/null && actionlint .github/workflows/ci-and-release.yml .github/workflows/legacy-app-build.yml || echo "actionlint not installed — skipping"`
Then: `grep -rInE "architect-web|interviewer-v8|network-canvas-(architect|interviewer)" .github/ | grep -v "id1538673677"`
Expected: no remaining hits except intentional ones (there should be none in `.github/`).

- [ ] **Step 6: Commit**

```bash
git add .github/
git commit -m "ci: rename app references and jobs for renamed apps"
```

---

### Task 4: New-apps display text + interviewer runtime-key clean break

**Files:**

- Modify (architect / was architect-web): `apps/architect/index.html`, `apps/architect/README.md`, `apps/architect/RELEASING.md`, and comment strings in `apps/architect/src/utils/reportError.ts`, `apps/architect/src/components/BackgroundLights.tsx`, `apps/architect/src/templates/__tests__/testing-token.test.ts`.
- Modify (interviewer / was interviewer-v8) — display: `apps/interviewer/index.html`, `apps/interviewer/README.md`, `apps/interviewer/RELEASING.md`, `apps/interviewer/src/components/OnboardingScreen.tsx`, `apps/interviewer/src/components/SettingsDialog.tsx`, `apps/interviewer/src/components/SetupWizard/Step5Analytics.tsx`, `apps/interviewer/src/lib/analytics/config.ts` (comment), `apps/interviewer/.storybook/preview.tsx`, `apps/interviewer/src/global.d.ts` (comment).
- Modify (interviewer) — runtime keys (clean break): `apps/interviewer/src/lib/db/db.ts`, `apps/interviewer/src/lib/vault/vaultStore.ts`, `apps/interviewer/src/lib/vault/crypto.ts`, `apps/interviewer/src/lib/vault/webauthn.ts`, `apps/interviewer/src/lib/installationId.ts`, `apps/interviewer/src/components/InstallBanner.tsx`, `apps/interviewer/src/lib/export/exportSessions.ts`, `apps/interviewer/src/lib/analytics/config.ts`, `apps/interviewer/src/lib/analytics/AnalyticsProvider.tsx`, `apps/interviewer/src/routes/Interview.tsx`.
- Test (must stay green): `apps/interviewer/src/components/__tests__/InstallBanner.test.tsx`, `apps/interviewer/src/lib/vault/__tests__/vaultStore.test.ts`.

**Interfaces:**

- Consumes: new dirs (Task 1).
- Produces: none downstream; self-contained app-internal changes.

- [ ] **Step 1: architect (was architect-web) display + comments**

- `apps/architect/index.html`: `<title>Architect Web</title>` → `<title>Architect</title>`.
- `apps/architect/README.md`, `apps/architect/RELEASING.md`: `replace_all` `@codaco/architect-web`→`@codaco/architect`; RELEASING heading `# Releasing Architect (web)`→`# Releasing Architect`; the "architect-web is on a `8.0.0-beta.N` line" and "Sibling of interviewer-v8's `build:web`" prose → drop `-web`/`-v8` (→ "Architect" / "interviewer"). Leave `NETLIFY_SITE_ID_ARCHITECT` and `deploy-architect-preview`.
- Comments: `reportError.ts` `error-reporting entry point for architect-web.` → `… for Architect.`; `BackgroundLights.tsx` `used elsewhere in architect-web` → `used elsewhere in Architect`; `testing-token.test.ts` fixture `'architect-web'` → `'architect'`.

- [ ] **Step 2: interviewer (was interviewer-v8) display text**

Replace the literal "Network Canvas Interviewer 8" / "Interviewer v8" / "v8" display strings:

- `index.html`: `<title>Network Canvas Interviewer 8</title>` → `<title>Network Canvas Interviewer</title>`.
- `README.md`: `# Network Canvas Interviewer v8` → `# Network Canvas Interviewer`; body "Network Canvas Interviewer v8 is …" → "Network Canvas Interviewer is …"; `replace_all` `@codaco/interviewer-v8`→`@codaco/interviewer`.
- `RELEASING.md`: `# Releasing Interviewer v8` → `# Releasing Network Canvas Interviewer`; `replace_all` `@codaco/interviewer-v8`→`@codaco/interviewer`; `deploy-interviewer-v8-preview`→`deploy-interviewer-preview`; the "same mechanism as architect-web" → "same mechanism as Architect"; "Create a new Netlify site for interviewer-v8" → "… for Network Canvas Interviewer". Leave `NETLIFY_SITE_ID_INTERVIEWER`.
- `OnboardingScreen.tsx`: "Welcome to Network Canvas Interviewer 8" → "Welcome to Network Canvas Interviewer".
- `SettingsDialog.tsx`: `desc="Network Canvas Interviewer 8"` → `desc="Network Canvas Interviewer"`.
- `Step5Analytics.tsx`: "help us improve Network Canvas Interviewer 8" → "… Network Canvas Interviewer".
- `.storybook/preview.tsx` comment "Interviewer v8 renders …" → "Network Canvas Interviewer renders …".
- `global.d.ts` comment `apps/interviewer-v8/package.json` → `apps/interviewer/package.json`.
- `src/lib/analytics/config.ts` comment "PostHog configuration for Interviewer v8." → "… for Network Canvas Interviewer.".

- [ ] **Step 3: interviewer runtime-key clean break (value renames)**

Rename these string **values** `interviewer-v8`→`interviewer` (and the two `:` / `-` suffixed forms as shown):

- `src/lib/db/db.ts`: `super('interviewer-v8')` → `super('interviewer')`.
- `src/lib/vault/vaultStore.ts`: `VAULT_STORAGE_KEY = 'interviewer-v8:vault'` → `'interviewer:vault'`.
- `src/lib/vault/crypto.ts`: `HKDF_INFO = 'interviewer-v8-dek-wrap'` → `'interviewer-dek-wrap'`.
- `src/lib/vault/webauthn.ts`: `name: 'interviewer-v8'` → `name: 'interviewer'`.
- `src/lib/installationId.ts`: `STORAGE_KEY = 'interviewer-v8:installation-id'` → `'interviewer:installation-id'`.
- `src/components/InstallBanner.tsx`: `SESSION_DISMISS_KEY = 'interviewer-v8:install-banner-dismissed'` → `'interviewer:install-banner-dismissed'`.
- `src/lib/export/exportSessions.ts`: `commitHash: 'interviewer-v8'` → `commitHash: 'interviewer'`.
- `src/lib/analytics/config.ts`: `POSTHOG_INSTANCE_NAME = 'interviewer-v8'` → `'interviewer'`.
- `src/lib/analytics/AnalyticsProvider.tsx`: `app: 'interviewer-v8'` → `app: 'interviewer'`.
- `src/routes/Interview.tsx`: `hostApp: 'interviewer-v8'` → `hostApp: 'interviewer'`.

- [ ] **Step 4: Update the two test fixtures to match**

- `src/components/__tests__/InstallBanner.test.tsx`: `'interviewer-v8:install-banner-dismissed'` → `'interviewer:install-banner-dismissed'` (every occurrence).
- `src/lib/vault/__tests__/vaultStore.test.ts`: `'interviewer-v8:vault'` → `'interviewer:vault'` (every occurrence).

- [ ] **Step 5: Typecheck + targeted vitest for the interviewer app**

Run: `pnpm --filter @codaco/interviewer typecheck`
Then: `pnpm --filter @codaco/interviewer exec vitest run src/lib/vault/__tests__/vaultStore.test.ts src/components/__tests__/InstallBanner.test.tsx`
Expected: typecheck clean; both test files pass with the new keys.

- [ ] **Step 6: Commit**

```bash
git add apps/architect apps/interviewer
git commit -m "refactor: update new-app display text and interviewer runtime keys"
```

---

### Task 5: Classic-apps display text ("Classic")

**Files:**

- Modify (architect-classic): `apps/architect-classic/index.html`, `apps/architect-classic/src/components/Home/WelcomeHeader.jsx`, `apps/architect-classic/src/components/RecentProtocols.jsx`, `apps/architect-classic/src/utils/previewDriver.js`, `apps/architect-classic/public/components/createAppWindow.js`.
- Modify (interviewer-classic): `apps/interviewer-classic/src/index.html`, `apps/interviewer-classic/src/main/windowManager.js`, `apps/interviewer-classic/src/main/dialogs.js`, `apps/interviewer-classic/src/containers/StartScreen/HeaderSection.jsx`, `apps/interviewer-classic/src/utils/protocol/parseProtocol.js`, `apps/interviewer-classic/src/hooks/useUpdater.jsx`.

**Interfaces:**

- Consumes: new dirs (Task 1). Self-contained.

- [ ] **Step 1: architect-classic display strings → "Network Canvas Architect Classic"**

- `index.html`: `<title>Network Canvas Architect</title>` → `<title>Network Canvas Architect Classic</title>`.
- `public/components/createAppWindow.js`: `title: "Network Canvas Architect"` → `title: "Network Canvas Architect Classic"`.
- `src/components/Home/WelcomeHeader.jsx`: `alt="Network Canvas Architect"` → `alt="Network Canvas Architect Classic"`.
- `src/components/RecentProtocols.jsx`: "Welcome to Network Canvas Architect!" → "Welcome to Network Canvas Architect Classic!".
- `src/utils/previewDriver.js`: comment "Preview driver for Network Canvas Architect." → "… Architect Classic." (leave the generic paragraph below it).

- [ ] **Step 2: interviewer-classic display strings → "Network Canvas Interviewer Classic"**

- `src/index.html`: `<title>Network Canvas Interviewer</title>` → `<title>Network Canvas Interviewer Classic</title>`.
- `src/main/windowManager.js`: `title: 'Network Canvas Interviewer'` → `title: 'Network Canvas Interviewer Classic'`.
- `src/main/dialogs.js`: `name: 'Network Canvas Interviewer protocol'` → `name: 'Network Canvas Interviewer Classic protocol'`.
- `src/containers/StartScreen/HeaderSection.jsx`: `alt="Network Canvas Interviewer"` → `alt="Network Canvas Interviewer Classic"`.
- `src/hooks/useUpdater.jsx`: "A new version of Network Canvas Interviewer is available." → "… Network Canvas Interviewer Classic is available." **Leave the App Store URL on the other line untouched.**
- `src/utils/protocol/parseProtocol.js`: "…not compatible with this version of Network Canvas Interviewer. Upgrade the protocol using Architect…" → "…not compatible with this version of Network Canvas Interviewer Classic. Upgrade the protocol using Architect…" (change only the first app-name; keep "using Architect" unqualified per the judgment call).

- [ ] **Step 3: Typecheck both classic apps**

Run: `pnpm --filter @codaco/architect-classic typecheck && pnpm --filter @codaco/interviewer-classic typecheck`
Expected: clean (or unchanged from pre-rename baseline for these legacy apps).

- [ ] **Step 4: Commit**

```bash
git add apps/architect-classic apps/interviewer-classic
git commit -m "refactor: mark classic apps' user-facing names as Classic"
```

---

### Task 6: Docs & skills

**Files:**

- Modify: `README.md`, `CLAUDE.md`, `.claude/skills/developing-in-network-canvas/SKILL.md`, `.claude/skills/creating-a-changeset/SKILL.md`, `.claude/skills/creating-a-network-canvas-interface/SKILL.md`, `apps/documentation/public/sidebar.json`, `docs/protocol-template-proposals.md`, `docs/research/2026-06-27-narrative-group-aware-layout.md`.

**Interfaces:** documentation only; no code consumers.

- [ ] **Step 1: Root docs — README.md and CLAUDE.md**

- `README.md`: the app table rows — `[`architect-web`](./apps/architect-web) | Protocol designer …` → `[`architect`](./apps/architect) | Protocol designer …`; `[`architect`](./apps/architect) | Legacy Electron build …` → `[`architect-classic`](./apps/architect-classic) | Legacy Electron build …`; `[`interviewer`](./apps/interviewer) | … Electron + Cordova …` → `[`interviewer-classic`](./apps/interviewer-classic) | Legacy … Electron + Cordova …`; add/adjust a row for the new `interviewer` PWA if the table lists it; `pnpm --filter @codaco/architect-web dev` → `@codaco/architect`.
- `CLAUDE.md`: `pnpm --filter @codaco/architect-web dev` → `@codaco/architect`; the interface-surface line `… in `apps/interviewer`, `apps/interviewer-v8`, Fresco. Researcher-facing = Architect (`apps/architect`, `apps/architect-web`)` → `… in `apps/interviewer-classic`, `apps/interviewer`, Fresco. Researcher-facing = Architect (`apps/architect-classic`, `apps/architect`)`; the changeset section `(`@codaco/architect-web`, `@codaco/interviewer-v8`)` → `(`@codaco/architect`, `@codaco/interviewer`)`.

- [ ] **Step 2: `.claude/skills/*` — mirror the CLAUDE.md interface-surface + changeset edits**

- `developing-in-network-canvas/SKILL.md`: same interface-surface line rewrite as CLAUDE.md Step 1.
- `creating-a-changeset/SKILL.md`: `An app: `@codaco/architect-web`or`@codaco/interviewer-v8`.` → `@codaco/architect` or `@codaco/interviewer`; table `Apps (`architect-web`, `interviewer-v8`)` → `Apps (`architect`, `interviewer`)`.
- `creating-a-network-canvas-interface/SKILL.md`: `apps/architect-web` → `apps/architect` in the Builder row and the editor-registry path (`apps/architect-web/src/components/StageEditor/Interfaces.tsx` → `apps/architect/src/…`).

- [ ] **Step 3: documentation site + design docs**

- `apps/documentation/public/sidebar.json`: `"label": "Architect Web FAQ"` → `"label": "Architect FAQ"`.
- `docs/protocol-template-proposals.md`: `apps/architect-web/src/config/index.ts` → `apps/architect/src/config/index.ts`; `apps/architect-web/src/components/Home/{Home,LibraryPanel}.tsx` → `apps/architect/src/…`.
- `docs/research/2026-06-27-narrative-group-aware-layout.md`: the two `architect-web` prose mentions → `architect`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md .claude/skills apps/documentation/public/sidebar.json docs/
git commit -m "docs: update app names across docs and skills"
```

---

### Task 7: Full verification sweep + changeset

**Files:** none edited except a new changeset file.

- [ ] **Step 1: Full grep sweep for stale identifiers**

Run:

```bash
grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=out --exclude-dir=.next --exclude-dir=.turbo --exclude-dir=storybook-static \
  -E "architect-web|interviewer-v8|network-canvas-(architect|interviewer)" . \
  | grep -vE "id1538673677|network-canvas-architect-installation-id|network-canvas-interviewer\.dek|CHANGELOG"
```

Expected: **zero** lines. Any hit is either a missed edit (fix it) or must be justified as a documented carve-out. (`CHANGELOG.md` history is excluded — do not rewrite historical changelog entries.)

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: passes (allowing for any pre-existing, unrelated failures — compare against the pre-rename baseline if in doubt).

- [ ] **Step 3: Build the renamed PWAs and the classic-architect graph**

Run:

```bash
pnpm exec turbo run build --filter=@codaco/architect --filter=@codaco/interviewer
pnpm --filter @codaco/architect build:web
pnpm --filter @codaco/interviewer build:web
pnpm exec turbo run build --filter=@codaco/architect-classic
```

Expected: all succeed. (`@codaco/architect-classic` build pulls `@codaco/interviewer-classic#build:web` for its preview host — confirms the workspace-dep rename resolved.)

- [ ] **Step 4: knip + lint**

Run: `pnpm knip && pnpm lint`
Expected: pass.

- [ ] **Step 5: Author the changeset(s)**

Invoke the `creating-a-changeset` skill. Write **two separate** app changesets (never mix app + library, never mix two apps in one file if the lane forbids it — follow the skill):

- One selecting `@codaco/architect` (minor): "Rename app from architect-web to architect."
- One selecting `@codaco/interviewer` (minor): "Rename app from interviewer-v8 to interviewer. Local data reset: existing beta installs get a fresh IndexedDB, prior encrypted vaults become unreadable, passkeys must be re-enrolled."
  Classic apps are `private` + ignored, so they take no changeset.

- [ ] **Step 6: Final commit**

```bash
git add .changeset/
git commit -m "chore: changesets for architect/interviewer app renames"
```

---

## Post-merge external follow-ups (user, outside the repo)

- Re-point GitHub **branch-protection required status checks** to the renamed jobs (`deploy-interviewer-preview`, and any other renamed check names). Merges block until done.
- (Optional) Rename the Netlify site slugs / production URLs in the Netlify dashboard. Site IDs are unchanged so CI keeps deploying regardless.
- No action needed for the classic standalone release repos (`repo:` kept).

## Self-Review notes

- **Spec coverage:** every spec section maps to a task — dirs/packages→T1; root config/scripts→T2; CI/GitHub→T3; new display + interviewer runtime keys→T4; classic display→T5; docs/skills→T6; verification + changeset + external follow-ups→T7. Carve-outs and hazards are in Global Constraints and repeated at point-of-use.
- **Ordering/substring hazards** are stated globally and re-flagged in T2 Step 3, T3 Step 2 (classic `apps/architect` vs new), and the delimiter rule.
- **No placeholders:** every edit lists the exact old→new string. Two files (`scripts/mirror-app.mjs`, `README.md` app table) instruct a re-read because their full occurrence set may exceed what the inventory captured — flagged explicitly rather than left vague.
