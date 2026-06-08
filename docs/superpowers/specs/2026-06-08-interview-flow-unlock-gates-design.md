# Interview-flow unlock gates + secured finish flow

**Date:** 2026-06-08
**App:** `apps/interviewer-v7`
**Status:** Design approved (2026-06-08) — ready for implementation plan

## Background

`apps/interviewer-v7` already has a step-up auth mechanism
(`StepUpAuthProvider` → `StepUpAuthDialog`, driven by the renderer's
`verify*` family) that re-authenticates before a sensitive action
without bouncing the global `AuthGate` to `locked`. Today two persisted
settings drive it:

- `requireUnlockOnResume` (default `true`) — fires when **resuming** an
  existing in-progress interview, but **not** when starting a new one.
  The new-session flow signals "fresh" via `navigate(..., { state: {
fresh: true } })` (in `handleSessionCreated` in `src/routes/Home.tsx`),
  which `Interview.tsx` reads to skip the gate.
- `requireUnlockOnExport` (default `false`) — fires before data export.

Both toggles are rendered by a single shared component,
`src/components/SecurityBehaviorControls.tsx`, consumed by **both** the
onboarding wizard (`SetupWizard/Step4Behavior.tsx`) and the settings
screen (`SettingsDialog.tsx`). New toggles added there appear in both
surfaces automatically — there is no duplicated UI to keep in sync.

The interview itself is hosted by the shared `@codaco/interview`
`Shell`, whose Navigation bar contains the exit (LogOut) button that
calls `onExit`, plus an appended `FinishSession` stage whose "Finish
Interview" button calls `onFinish`. `Shell` is also consumed by
`architect-web`'s PreviewHost and the interview package's e2e host, so
its behaviour is intentionally left unchanged by this work.

## Goals

1. **Unify the entry gate.** Replace `requireUnlockOnResume` with a
   single `requireUnlockOnEnter` (default `true`) that fires when
   entering **any** interview — newly started or resumed. Remove the
   now-dead `fresh` plumbing.
2. **Add an exit gate.** New `requireUnlockOnExit` (default `false`):
   when on, exiting an interview back to the dashboard requires a fresh
   unlock. Covers both the mid-interview exit button and the
   finished-screen exit.
3. **Secured finish flow.** Replace today's auto-redirect to `/data`
   after finishing with a terminal, app-level **"Interview complete"**
   screen that has no navigation bar. Its only control is an exit
   button gated by `requireUnlockOnExit`. The screen always appears;
   the exit is only secured when `requireUnlockOnExit` is on and a real
   lock mode is set.
4. **Document the feature.** Add a technical description of app
   security (credential/DEK model, the five modes, step-up auth, and
   the new interview-flow gates) to `apps/interviewer-v7/README.md` and
   `apps/interviewer-v7/CLAUDE.md`.

### Non-goals

- Changing the `@codaco/interview` `Shell`, its Navigation bar, or the
  `FinishSession` stage. All flow changes live in `interviewer-v7`.
- Re-encrypting the DB, recovery codes, or any change to the five auth
  modes / DEK custody model.
- Data migration. The app is in development; settings are stored as a
  JSON blob (`electron/db/schema.ts` `settings_json`; Dexie row), so
  the field rename is type-level only — stale `requireUnlockOnResume`
  values in dev data are dropped on read and the new field takes its
  default.

## Design

### Settings model (`src/lib/db/types.ts`)

`StoredSettings` security-behaviour fields become:

| Field                                    | Default | Fires when                                                                        |
| ---------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `requireUnlockOnEnter` (was `…OnResume`) | `true`  | Entering any interview — new **or** resumed                                       |
| `requireUnlockOnExit` (new)              | `false` | Exiting to the dashboard — mid-interview exit button **and** finished-screen exit |
| `requireUnlockOnExport` (unchanged)      | `false` | Before exporting data                                                             |

`idleTimeoutMinutes` is unchanged. `DEFAULT_SETTINGS` is updated to
rename the field and add `requireUnlockOnExit: false`. No Electron SQL
schema change (the whole object is serialised to `settings_json`);
`electron-settings.ts` passes settings through opaquely and needs no
change unless it enumerates fields (it does not today).

The rename is applied at every call site with no compatibility alias
(per project convention): `types.ts`, `DEFAULT_SETTINGS`,
`SecurityBehaviorControls.tsx`, `Step4Behavior.tsx`,
`SettingsDialog.tsx`, `Interview.tsx`, and any tests referencing
`requireUnlockOnResume`.

### Shared toggle UI (`src/components/SecurityBehaviorControls.tsx`)

Extend the `Behavior` type and the rendered controls:

```ts
export type Behavior = {
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnEnter: boolean; // renamed
  requireUnlockOnExit: boolean; // new
  requireUnlockOnExport: boolean;
};
```

Controls, in order: Auto-lock after (unchanged); "Require unlock when
entering an interview"; "Require unlock when exiting an interview";
"Require unlock before exporting data". Each is the existing
`UnconnectedField` + `ToggleField` pattern.

Update the two consumers to match:

- `Step4Behavior.tsx` — `DEFAULT_BEHAVIOR` and `asBehavior()` carry the
  renamed + new field (default `requireUnlockOnExit: false`).
- `SettingsDialog.tsx` — the `behavior` object and
  `handleBehaviorChange` map the renamed + new field through `persist`.

### Enter gate (`src/routes/Interview.tsx`)

Drop the fresh/resume distinction. In the load effect, gate
unconditionally on the unified setting:

```ts
const settings = await getSettings();
if (settings.requireUnlockOnEnter) {
  const result = await requireFreshUnlock();
  if (!result.ok) {
    if (active) navigate('/');
    return;
  }
}
```

Remove the dead `fresh` plumbing end-to-end: the
`InterviewLocationState` type, `historyState`, the
`navigate(location, { replace, state: null })` reset, and the
`{ state: { fresh: true } }` argument in `handleSessionCreated` in
`src/routes/Home.tsx`.

Edge case (documented, accepted): cancelling the gate on a
just-created new session leaves an empty session in the list — same
class as today's resume-cancel; recoverable via Sessions.

### Exit gate + shared exit handler (`src/routes/Interview.tsx`)

Add a single gated-exit callback used by both the `Shell` exit button
and the finished screen:

```ts
const handleExit = useCallback(async () => {
  const settings = await getSettings();
  if (settings.requireUnlockOnExit) {
    const result = await requireFreshUnlock();
    if (!result.ok) return; // stay where we are
  }
  navigate('/');
}, [requireFreshUnlock, navigate]);
```

Wire `onExit={() => void handleExit()}` on `Shell` (replacing
`onExit={() => navigate('/')}`). On cancel the user stays in the
interview; the global `AuthGate` never flips to `locked` (step-up runs
in its own dialog).

### Finished screen (`src/components/InterviewComplete.tsx` + `Interview.tsx`)

`handleFinish` stops navigating to `/data`. It marks the session
finished and flips local state so `InterviewRoute` renders the finished
screen instead of the `Shell`:

```ts
const handleFinish = useCallback(async (id: string) => {
  await markSessionFinished(id);
  setFinished(true);
}, []);
```

`InterviewRoute` renders `<InterviewComplete onExit={() => void handleExit()} />`
when `finished` is true (or — see below — when the loaded session is
already finished). Because the route is full-screen and the `Shell` is
unmounted, there is no interview Navigation bar and no app navigation —
the only control is the gated exit.

`src/components/InterviewComplete.tsx` is a small presentational
component: a centered `Surface` with a heading ("Interview complete"),
a short confirmation paragraph, and a single `Button` ("Exit") wired to
the `onExit` prop. It mirrors the existing `kind: 'missing'` layout in
`Interview.tsx`.

**Re-entry / reload:** in the load effect, after fetching the session,
if `session.finishedAt` is set, render the finished screen directly
instead of building the `Shell` payload. This makes reload-on-finished
and re-opening a completed session consistent with the
"responses cannot change after finishing" contract, and the enter gate
still runs first when `requireUnlockOnEnter` is on.

### Documentation

- **`apps/interviewer-v7/README.md`** — add a "Step-up auth &
  interview-flow gates" subsection under "Architecture — auth flow"
  describing: the `verify*`/`requireFreshUnlock()` mechanism; the three
  gates (`requireUnlockOnEnter`, `requireUnlockOnExit`,
  `requireUnlockOnExport`) and their defaults; and the secured finish
  flow (terminal Interview-complete screen, exit gated by
  `requireUnlockOnExit`). Note the relevant invariant: the finished
  screen always renders, but `requireFreshUnlock()` short-circuits to
  success when `mode === 'none'`, so there is still no
  "security-disabled" branch.
- **`apps/interviewer-v7/CLAUDE.md`** — update the step-up paragraph in
  Conventions to list the three gates and the finish flow; add a
  `src/components/` row note for `InterviewComplete`; update the
  `Interview.tsx` and `src/lib/db/` rows for the gates + field rename.

## Component / file map

| File                                           | Action | Purpose                                                                                          |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `src/lib/db/types.ts`                          | UPDATE | Rename `requireUnlockOnResume`→`requireUnlockOnEnter`; add `…OnExit`; update `DEFAULT_SETTINGS`. |
| `src/components/SecurityBehaviorControls.tsx`  | UPDATE | Extend `Behavior` + render the renamed + new toggle.                                             |
| `src/components/SetupWizard/Step4Behavior.tsx` | UPDATE | `DEFAULT_BEHAVIOR` / `asBehavior` carry renamed + new field.                                     |
| `src/components/SettingsDialog.tsx`            | UPDATE | `behavior` map + `handleBehaviorChange` carry renamed + new field.                               |
| `src/routes/Interview.tsx`                     | UPDATE | Unified enter gate; `handleExit`; finished state + render; finished-on-load.                     |
| `src/routes/Home.tsx`                          | UPDATE | Drop `{ state: { fresh: true } }` from new-session navigate.                                     |
| `src/components/InterviewComplete.tsx`         | NEW    | Terminal "Interview complete" screen with a single gated exit button.                            |
| `apps/interviewer-v7/README.md`                | UPDATE | Step-up auth + interview-flow gates + finish-flow description.                                   |
| `apps/interviewer-v7/CLAUDE.md`                | UPDATE | Conventions + source-surface rows.                                                               |

## Testing

Vitest, co-located in `__tests__/`:

- `SecurityBehaviorControls` — renders all controls; toggling the new
  `requireUnlockOnExit` and renamed `requireUnlockOnEnter` calls
  `onChange` with the right patch.
- `Interview.tsx` enter gate — fires for both a fresh and a resumed
  session when `requireUnlockOnEnter` is on; cancel navigates to `/`;
  no gate when off.
- `Interview.tsx` exit gate — `handleExit` calls `requireFreshUnlock`
  only when `requireUnlockOnExit` is on; cancel does not navigate;
  success navigates to `/`.
- `Interview.tsx` finish flow — `handleFinish` marks finished and shows
  `InterviewComplete` rather than navigating; a session loaded with
  `finishedAt` set renders `InterviewComplete` directly.
- `InterviewComplete` — renders heading/paragraph; the exit button
  invokes `onExit`.
- Update existing Interview / settings tests for the field rename.

Manual smoke (not automated): with each lock mode, verify the enter
gate on start + resume, the exit gate on the exit button + finished
screen, and that with `mode: none` the finished screen still appears
but exit proceeds without a prompt.

## Edge cases & decisions

- **`requireUnlockOnExit` default `false`** (per decision) — opt-in,
  unlike the enter gate.
- **Finished screen always shows** regardless of lock mode; security is
  enforced only through `requireFreshUnlock()`, which is a no-op under
  `mode: none`.
- **Cancelling the enter gate on a new session** leaves an empty
  session (accepted; recoverable via Sessions).
- **Already-finished session entry** renders the finished screen (after
  the enter gate), keeping finished interviews immutable in the engine.
