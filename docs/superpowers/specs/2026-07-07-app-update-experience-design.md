# App update experience — design

- **Date:** 2026-07-07
- **Status:** Approved (design); ready for implementation planning
- **Apps affected:** `@codaco/architect`, `@codaco/interviewer`, `@codaco/fresco-ui`

## Motivation

CI posts a GitHub release per app on each deploy, with a changeset-derived
markdown changelog. Today neither app surfaces that: each shows only a static
version string, and update handling is a bottom-of-screen toast
(`PwaUpdateBanner`) that says "a new version is available" with no detail about
_what_ changed.

We want to turn the existing version indicator into a live **update indicator**
that (a) tells the user when an update is available and lets them install it,
(b) confirms when the app has just been updated, and (c) shows the release
changelog in both cases — replacing the toast in both apps.

## Goals

- A shared, reusable **`Pill`** component in `fresco-ui`, styled from the two
  existing version indicators (monospace, size prop, optional icon, and
  background/border that can toggle **without changing the layout box**).
- A shared **`AppUpdateIndicator`** that renders the pill in three states
  (idle / update-available / just-updated), with a changelog dialog.
- Both apps mount `AppUpdateIndicator` in place of their version indicator and
  delete `PwaUpdateBanner`.
- Changelog markdown is pulled from the app's GitHub release and rendered in an
  inset scroll area.
- Storybook coverage for `Pill` and `AppUpdateIndicator`.

## Non-goals

- No change to the release/CI pipeline or the changeset flow.
- No authenticated GitHub access (public repo; unauthenticated REST is enough).
- No redesign of `fresco-ui`'s existing semantic-status `Badge` — it stays as is.
- No new persistence layer: release notes and the last-launched version live in
  `localStorage` (release notes are public, non-sensitive).

## Current state (as explored)

**fresco-ui**

- `packages/fresco-ui/src/Badge.tsx` — shadcn-style **semantic status** badge
  (`default | secondary | destructive | outline`), fixed `text-xs`, no size prop,
  no monospace, no icon slot, no bg/border toggle. **Not** a fit for a version
  pill; left untouched.
- Primitives available and reused here: `Icon` (`@codaco/fresco-ui/Icon`,
  Lucide + custom set), `Modal` + `Modal/ModalPopup` (Base-UI, self-portaling,
  no provider needed), `ScrollArea`, `RenderMarkdown` (GFM via `remark-gfm`),
  `Tooltip`, `Button`.
- Tokens: `font-monospace`; colours `sea-serpent` / `sea-green`
  (`bg-sea-serpent`, `bg-sea-green`, semi-transparent via `/NN` opacity).
- Storybook: CSF3 (`@storybook/react-vite`), `satisfies Meta<…>`,
  `tags: ['autodocs']`, titles `Components/…`, global theme decorator
  (dashboard / interview), play tests via `storybook/test`. Non-story helpers are
  kept **un-exported** (no `excludeStories` needed).

**Architect** (`apps/architect`, v8.0.0-beta.3)

- Version pill: `src/components/Home/Home.tsx` renders the app-local
  `src/components/Badge.tsx` with `color="platinum"` (`bg-platinum text-charcoal`,
  a green status dot, `v{appVersion}`) in `NavShell`'s `trailing` slot
  (`src/components/ProjectNav/NavShell.tsx`; nav is `bg-fresco-purple`).
- Version source: `src/utils/appVersion.ts` (`pkg.version`); also
  `__APP_VERSION__` define in `vite.config.ts`.
- Update handling: `src/components/PwaUpdateBanner.tsx` — `useRegisterSW` from
  `virtual:pwa-register/react` (`needRefresh`, `updateServiceWorker`), hourly
  `registration.update()` poll, a 20s fresh-load silent-update window, and a
  `reloadWouldLoseWork` signal gating silent reloads. **To be removed.**
- PWA: `vite.config.ts` `VitePWA({ registerType: 'prompt', … })`.
- CSP `connect-src` (meta-injected in `vite.config.ts`) does **not** include
  `https://api.github.com`.

**Interviewer** (`apps/interviewer`, v8.0.0-beta.2)

- Version string: `src/components/StatusRow.tsx` — a right-hand group
  `flex items-center gap-3.5` (inside a `font-monospace text-text/60 … text-xs`
  row) holding an **encryption** indicator, a **persistence** indicator, and a
  `<span>Interviewer {APP_VERSION}</span>`.
- Version source: `src/lib/appVersion.ts` (`export const APP_VERSION = __APP_VERSION__`).
- Update handling: `src/components/PwaUpdateBanner.tsx` — same `useRegisterSW`
  pattern; visible = `needRefresh && !dismissed && !interviewActive`. **To be removed.**
- PWA: `vite.config.ts` `VitePWA({ registerType: 'prompt', … })`; version define
  and CSP live in `vite.renderer.config.ts`.
- CSP `connect-src` (meta-injected in `vite.renderer.config.ts`) does **not**
  include `https://api.github.com`.

**Releases**

- Repo `complexdatacollective/network-canvas-monorepo`.
- Per-app git tags / release names: `@codaco/architect@<version>` and
  `@codaco/interviewer@<version>`. Release `body` is changeset-derived markdown.
- REST: `GET /repos/{owner}/{repo}/releases` (list, newest first) and
  `GET /repos/{owner}/{repo}/releases/tags/{tag}` (URL-encode the `@`/`/` in the
  tag). Prereleases (`-beta.N`) are excluded from `/releases/latest`, so we never
  use `latest`.

## Architecture

One shared system; each app supplies only its PWA wiring.

| Piece                    | Location                                                                                                         | Responsibility                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Pill`**               | `fresco-ui/src/Pill.tsx`                                                                                         | Presentational monospace pill. `size`, optional `icon`, spacing-stable `variant`, `asChild`, `className`.                                   |
| **release-notes module** | `fresco-ui/src/appUpdate/releaseNotes.ts`                                                                        | Fetch a release `body` from GitHub + `localStorage` cache keyed by version. Pure, DOM-only.                                                 |
| **`useAppUpdate`**       | `fresco-ui/src/appUpdate/useAppUpdate.ts`                                                                        | Orchestration: derive `status`, fetch/cache notes, version-change detection, one-shot auto-apply policy. Imports nothing app-specific.      |
| **`AppUpdateIndicator`** | `fresco-ui/src/appUpdate/AppUpdateIndicator.tsx`                                                                 | Consumes `useAppUpdate`; renders `Pill` (as button in update states) + `Tooltip` + `Modal` changelog dialog.                                |
| **per-app wrapper**      | `apps/architect/src/components/AppUpdateIndicator.tsx`, `apps/interviewer/src/components/AppUpdateIndicator.tsx` | Owns `useRegisterSW` (`needRefresh` / `updateServiceWorker` / poll) and the unsaved-work signal; passes primitives to the shared component. |

`fresco-ui` never imports `virtual:pwa-register`; the app passes `needRefresh`,
`onInstall`, and `hasUnsavedWork` as plain props/values. The dialog uses
`Modal`/`ModalPopup` (not either app's dialog system) so it drops into both
apps identically.

### 1. `Pill` (`fresco-ui/src/Pill.tsx`)

Founded on the existing fresco-ui component conventions (cva variants, token
utilities, `asChild` via the same pattern `Button` uses).

```tsx
type PillProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof pillVariants> & {
    asChild?: boolean; // render as <button> etc. for interactive states
    icon?: React.ReactNode; // e.g. <Icon name="RefreshCw" />; gap only when present
  };

const pillVariants = cva({
  // border is ALWAYS present (transparent by default) so the border-box is
  // identical across variants — toggling bg/border never reflows neighbours.
  base: 'inline-flex items-center rounded-full border border-transparent font-monospace',
  variants: {
    size: {
      sm: 'gap-1 px-2 py-0.5 text-xs',
      md: 'gap-1.5 px-2.5 py-1 text-xs',
      lg: 'gap-2 px-3 py-1.5 text-sm',
    },
    variant: {
      ghost: '', // no bg/border (interviewer idle)
      filled: 'bg-current/10', // token bg; caller sets colour
      outline: 'border-current/20', // visible border, no bg
    },
  },
  defaultVariants: { size: 'md', variant: 'ghost' },
});
```

- **Spacing stability** is the load-bearing requirement: the transparent border
  in `base` and constant `px/py` per size mean a `ghost → filled` swap (idle →
  update state) changes only paint, not geometry.
- Colour of a `filled` pill is set by the caller via `className`
  (`bg-sea-serpent/20 text-sea-serpent`, `bg-sea-green/20 text-sea-green`, or
  architect's `bg-platinum text-charcoal`), so the Pill stays colour-agnostic.
- **Icon** slot renders before the label with the size's gap; omitted entirely
  when `icon` is undefined (no reserved gap).
- **`asChild`** lets the update states render a real `<button>` (keyboard +
  focus-ring via `focusable`), while idle renders a `<span>`.

### 2. Release notes (`fresco-ui/src/appUpdate/releaseNotes.ts`)

Pure functions + a tiny `localStorage` cache. Rationale for fetch-at-detection
(user's insight): an "update available" state can only follow a **successful,
online** service-worker check, so that is exactly when we fetch and cache the
notes; the dialog then only ever _reads_ the cache, and the same cache entry
carries over to the "just updated" state after reload.

```ts
const REPO = 'complexdatacollective/network-canvas-monorepo';
const TAG_PREFIX = { architect: '@codaco/architect@', interviewer: '@codaco/interviewer@' };

type ReleaseNotes = { version: string; body: string };

// Newest release for this app (used when an update becomes available and we
// don't yet know the waiting version). Lists /releases, filters by tag prefix,
// returns the newest { version, body }.
fetchLatestReleaseNotes(app): Promise<ReleaseNotes | null>

// Notes for a specific version (used on a "just updated" load if the cache is
// empty). GETs /releases/tags/<encoded tag>.
fetchReleaseNotesForVersion(app, version): Promise<ReleaseNotes | null>

// localStorage cache under `nc:updateNotes:<app>` = { version, body }.
readCachedNotes(app): ReleaseNotes | null
writeCachedNotes(app, notes): void
```

- Unauthenticated `fetch`; ~1 request per detected update — far under the
  60/hour anonymous limit.
- **Fallback order** (only exercised on the rare empty-cache path): cached →
  `fetchReleaseNotesForVersion(currentVersion)` → bundled `CHANGELOG.md` section
  for the current version → a plain "release notes unavailable" message.

### 3. `useAppUpdate` (`fresco-ui/src/appUpdate/useAppUpdate.ts`)

```ts
useAppUpdate(opts: {
  app: 'architect' | 'interviewer';
  currentVersion: string;
  needRefresh: boolean;      // from the app's useRegisterSW
  hasUnsavedWork: boolean;   // architect: reloadWouldLoseWork; interviewer: interviewActive
  installUpdate: () => void; // wraps updateServiceWorker(true)
}): {
  status: 'idle' | 'available' | 'updated';
  availableVersion?: string;
  releaseNotes: ReleaseNotes | 'loading' | null;
  install: () => void;
}
```

Behaviour:

- **Version-change detection.** Persist `nc:lastLaunchedVersion:<app>`. On mount,
  if a stored value exists and differs from `currentVersion` → seed `updated`,
  then write `currentVersion`. First-ever launch (no stored value) → `idle`
  (never show "updated" on a clean install).
- **Fetch/cache.** When `needRefresh` turns true → `fetchLatestReleaseNotes`,
  cache, expose as `releaseNotes` and `availableVersion`. In `updated` state,
  read the cache; if it lacks the current version, fall back per §2.
- **One-shot auto-apply (per "defer to manual button").** In an SPA the only
  sources of a `needRefresh` transition are the initial SW registration/check at
  mount and the hourly `registration.update()` poll — so the _first_ observed
  `needRefresh` is, in practice, the fresh-load one. Rule: auto-apply fires **at
  most once**, on the first time `needRefresh` is `true` **while**
  `hasUnsavedWork` is `false` — call `installUpdate()` (skip-waiting + reload →
  lands on the new version → `updated`). If work is in progress at that first
  observation, or for **any** later `needRefresh` transition, surface the
  `available` button instead — never a forced reload. This lives in
  `useAppUpdate` (a `hasAutoApplied` ref); the wrapper only issues an immediate
  startup `registration.update()` so a waiting worker is discovered promptly on
  load. Replaces architect's 20s-window logic — no time window.
- **Priority:** `available` > `updated` > `idle`.

### 4. `AppUpdateIndicator` (`fresco-ui/src/appUpdate/AppUpdateIndicator.tsx`)

```tsx
type AppUpdateIndicatorProps = {
  app: 'architect' | 'interviewer';
  appName: string; // 'Architect' | 'Interviewer' (tooltip/dialog)
  currentVersion: string;
  label?: React.ReactNode; // idle pill text; default `${appName} ${version}`
  needRefresh: boolean;
  hasUnsavedWork: boolean;
  onInstall: () => void; // () => updateServiceWorker(true)
  unsavedWorkCaveat?: React.ReactNode; // shown in the available dialog when relevant
  className?: string; // colour override for the idle pill
  size?: 'sm' | 'md' | 'lg';
};
```

The pill label is the version text in **all** states; states differ only in
paint/icon/interactivity.

- **`idle`** → `ghost` Pill. Architect passes `label={`v${version}`}` +
  `className="bg-platinum text-charcoal"` (white-on-purple, no border) and may
  keep its status dot via `icon`. Interviewer uses the default
  `Interviewer {version}` label, no colour override. No dialog.
- **`available`** → `filled` Pill rendered as a **button**,
  `bg-sea-serpent/20 text-sea-serpent`, `icon={<Icon name="RefreshCw" />}`.
  Click opens the dialog: heading "Update available" (+ `availableVersion`),
  changelog markdown via `RenderMarkdown` (GFM section tags) inside an inset
  `ScrollArea`, an **"Install and reload"** primary action calling `onInstall`,
  and `unsavedWorkCaveat` when provided.
- **`updated`** → `filled` Pill button, `bg-sea-green/20 text-sea-green`,
  wrapped in a `Tooltip` "{appName} was updated!". Click opens the **same**
  dialog **without** the install action (a plain close).

Accessibility: the update states are real buttons (keyboard-operable, focus
ring); the tooltip content is available to AT; the dialog is a Base-UI `Modal`
(focus trap, Escape, ARIA). The pill's colour swaps carry non-colour cues (icon
for available, tooltip + copy for updated), not colour alone.

### 5. Per-app wiring

Each wrapper is thin: `useRegisterSW` + poll + unsaved-work signal → props.

**Architect** — `apps/architect/src/components/AppUpdateIndicator.tsx`

- `useRegisterSW` (moved out of the deleted `PwaUpdateBanner`), hourly poll,
  `reloadWouldLoseWork` for `hasUnsavedWork`, `unsavedWorkCaveat` = "Reloading
  updates this tab and any other open Architect tabs; unsaved changes in
  progress will be lost." (only when work is in progress).
- Mounted in `Home.tsx`'s `NavShell` `trailing` slot, replacing the local
  `Badge` version pill. `label={`v${version}`}`,
  `className="bg-platinum text-charcoal"`.

**Interviewer** — `apps/interviewer/src/components/AppUpdateIndicator.tsx`

- `useRegisterSW` + poll (moved out of the deleted `PwaUpdateBanner`),
  `hasUnsavedWork = interviewActive`, `unsavedWorkCaveat` = "Your responses are
  saved. Reloading now will return you to the start screen." (only when an
  interview is active).
- Mounted in `StatusRow.tsx` replacing the version `<span>`; default label.
- **Gap tweak:** the status group changes from `gap-3.5` to `gap-6`.

**Both** — add `https://api.github.com` to `connect-src`:
`apps/architect/vite.config.ts` and
`apps/interviewer/vite.renderer.config.ts`. (Meta-injected CSP rides the SW
revision; dev enforces no CSP, so verify in `vite preview`.)

Delete `apps/architect/src/components/PwaUpdateBanner.tsx` and
`apps/interviewer/src/components/PwaUpdateBanner.tsx` and their mount points.

### 6. Testing / Storybook

- **`Pill.stories.tsx`** (`Components/Pill`): args-driven — `size`, `variant`,
  with/without `icon`, monospace; the architect white-bg override; a
  "spacing stable" story asserting a `ghost ↔ filled` swap doesn't move the
  label. In both dashboard + interview themes.
- **`AppUpdateIndicator.stories.tsx`** (`Components/AppUpdateIndicator`): the
  three states with mocked `releaseNotes`, both themes. **Play tests:** open the
  dialog from the `available` pill → assert changelog renders + "Install and
  reload" present; from `updated` → assert dialog opens with no install action.
- **Unit tests** (Vitest, co-located `__tests__`): release-tag filtering /
  newest-selection in `releaseNotes.ts`; version-change detection in
  `useAppUpdate` (first launch → idle; changed → updated; unchanged → idle).

### fresco-ui exports

Add subpath exports (no barrels): `@codaco/fresco-ui/Pill`,
`@codaco/fresco-ui/appUpdate/AppUpdateIndicator`. Keep `releaseNotes` /
`useAppUpdate` internal unless a consumer needs them directly (run `knip`).

## Release / changesets

User-facing change in both apps + a `fresco-ui` library change. Per the repo's
changeset lanes, **never mix an app and a library in one changeset**:

- one **library** changeset for `@codaco/fresco-ui` (new `Pill` /
  `AppUpdateIndicator`);
- one **app** changeset each for `@codaco/architect` and `@codaco/interviewer`
  (beta lane), describing the new update experience.

Authored via the `creating-a-changeset` skill at finish time.

## Risks / edge cases

- **Release/deploy ordering.** The GitHub release is created in the same CI job
  as the Netlify deploy; a client could momentarily see a waiting SW before the
  release exists. Handled by the null-tolerant fetch (dialog shows a graceful
  "release notes unavailable" until a later read succeeds); the update action
  itself never depends on the notes.
- **Tag encoding.** `@codaco/architect@x` contains `@` and `/`; always
  URL-encode before hitting `/releases/tags/`.
- **Rate limiting.** Anonymous 60/hour is ample given at most one fetch per
  detected update; no polling of the API (only the SW polls).
- **Auto-apply reload race.** If auto-apply reloads before the notes fetch
  finishes, the `updated` load re-fetches by current version (online, having
  just updated) or falls back to the bundled changelog.
