# Interviewer export: progress dialog with terminal save action

**Date:** 2026-08-04
**Status:** Approved (Storybook coverage for the dialog is a required
deliverable: per-state stories plus interaction tests in the app's storybook
vitest project)
**Scope:** `apps/interviewer` only. Addresses issue #1187. Builds on the
two-step export introduced in PR #743, the #889/#893 share fallback, and the
2026-07-08 export-save-ladder spec.

## Problem

Exporting reads as two disconnected operations. Tapping **Export** builds the
archive with no visible progress, then announces completion via a transient
toast ("Archive ready — Tap Save export…") while a new **Save export** button
appears in the toolbar. On iOS — where the second tap exists to satisfy Web
Share's user-activation requirement — researchers experience this as a broken
flow: the toast disappears, the button sits where they are not looking, and
nothing communicates that the export is unfinished until it is saved.

The second gesture itself cannot be removed on iOS: `navigator.share()` must
be invoked synchronously within a transient user activation, the Web Share API
cannot accept a promise of files, and the archive build is long-running async
work that outlives the activation of the original tap (see
`2026-07-01-interviewer-v8-pwa-design.md`, "User-gesture constraint"). What
can change is the affordance: the second tap should be the obvious
continuation of the operation the researcher just started, not a scavenger
hunt.

## Decision

Replace the toast + toolbar **Save export** button with a single modal export
dialog that opens on the Export tap and carries the flow end-to-end:

**building** (progress) → **ready** (primary Share/Save action) → close on
save success. The dialog's primary action button provides the fresh user
gesture; because it is the focused primary action of a modal the researcher is
already looking at, the flow reads as one continuous operation even though it
still contains two activations on iOS.

`saveBlob` and its three-rung ladder are untouched. The change is confined to
the flow state in `useSessionMutations`, a new `ExportDialog` component, the
toolbar, and a small `runExport` addition (cancellation).

## Invariants preserved (previously-resolved issues)

Any deviation from these during implementation is a bug:

1. **Gesture freshness.** The dialog's primary-action click handler calls
   `saveBlob` with no `await` before it. State updates (synchronous) are fine;
   awaiting anything first re-creates the iOS `NotAllowedError` (PR #743).
2. **`exportedAt` stamped only from the save outcome** — never on the
   in-memory build (2026-07-08 spec). Dismissing the dialog, cancelling the
   share sheet, or a save failure must not call `markSessionsExported`.
3. **`canShare()` fallthrough** (#889): unchanged inside `saveBlob`. The
   dialog may therefore label the action "Share…" and the actual save may land
   as a download; the outcome is still `saved: true` and this is acceptable.
4. **Step-up auth runs before the build**, and before the export dialog
   opens — never stacked on top of it (`requireUnlockOnExport`).
5. **Double-tap re-entry guard.** The in-flight **ref** stays. React state is
   scheduled, not immediate, so a `phase === 'saving'` check alone cannot
   block two clicks in the same frame — the ref is the correctness guard; the
   phase state only drives the disabled appearance.

## Flow state machine

`useSessionMutations` replaces `pendingShare: {...} | null` + `exporting`
with one discriminated union:

```ts
type ExportFlow =
  | { phase: 'idle' }
  | {
      phase: 'building';
      sessionCount: number;
      // Latest stage message; percent only once a progress event with a
      // total has arrived (indeterminate before that).
      stageMessage: string;
      percent: number | null;
    }
  | {
      phase: 'ready' | 'saving';
      blob: Blob;
      fileName: string;
      sessionIds: string[]; // successful exports only
      exportGraphML: boolean;
      exportCSV: boolean;
      failedCount: number;
    }
  | { phase: 'error'; message: string };
```

Transitions:

| From       | Event                                    | To         | Side effects                                                                                |
| ---------- | ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `idle`     | Export tap (after optional step-up)      | `building` | Start `runExport` with an `AbortController`                                                 |
| `building` | Pipeline resolves with a blob            | `ready`    | —                                                                                           |
| `building` | Cancel action                            | `idle`     | `abort()`; rejection is swallowed when `signal.aborted`                                     |
| `building` | Pipeline rejects                         | `error`    | `captureException`                                                                          |
| `ready`    | Primary action tap                       | `saving`   | `saveBlob` called synchronously in the handler                                              |
| `saving`   | `saved: true`                            | `idle`     | `markSessionsExported`, `data_exported` analytics, `clearSelection`, reloads, success toast |
| `saving`   | `saved: false` (user cancelled)          | `ready`    | none — the open dialog is the retry affordance                                              |
| `saving`   | save throws                              | `ready`    | `captureException` + destructive toast; archive retained for retry                          |
| `ready`    | Dismiss (Escape / backdrop / ✕ / Cancel) | `idle`     | Archive discarded; nothing marked; **selection retained**                                   |
| `error`    | Close                                    | `idle`     | —                                                                                           |

`handleExport` still does, in order: `resolveSelectedIds` → `getSettings` →
optional `requireFreshUnlock()` → set `building` → `runExport`. All three
pre-build steps are fast IndexedDB reads; the dialog opens within the same
interaction beat as the tap.

## Dialog

A new app-local component,
`src/components/DataView/ExportDialog.tsx`, rendered by `DataView` and driven
entirely by the `ExportFlow` state. It composes existing primitives only — the
controlled `@codaco/fresco-ui/dialogs/Dialog` (the `AuthenticationDialog`
idiom), `ProgressBar`, `Alert`, `Button`, `typography/Paragraph`. Nothing new
in fresco-ui.

### `building`

- Title: `'Exporting 1 interview'` / `` `Exporting ${n} interviews` `` (whole
  strings per plural form, matching the existing DataView convention).
- Body: horizontal `ProgressBar` — indeterminate until a `progress` event with
  a `total` arrives, then `percent` — plus the current stage message.
  `runExport`'s `onEvent` (currently wired to a noop) feeds both;
  `stageMessages` in `@codaco/network-exporters/events` already provides the
  user-facing strings.
- Footer: **Cancel** (aborts the pipeline).
- `dismissible={false}` — an accidental backdrop click or Escape must not
  destroy a long build; cancellation is the explicit footer action only.

### `ready`

- Title: `'Archive ready'` (same string the toast used; the e2e assertion on
  it keeps passing).
- Body: the file name, the exported-interview count, and one of three whole
  description strings keyed by the save mechanism (below):
  - save-as: `'Choose where to save the archive. Interviews are marked as exported once the file is saved.'`
  - share: `'Share the archive to save or send it. Interviews are marked as exported once sharing completes.'`
  - download: `'Download the archive. Interviews are marked as exported once the download starts.'`
- If `failedCount > 0`, a warning `Alert`:
  `'1 interview could not be exported and is not included in this archive.'` /
  `` `${n} interviews could not be exported and are not included in this archive.` ``
  (replaces the current destructive toast fired at build end).
- Footer: **Cancel** first (pinned left per the `DialogFooter` convention;
  dismisses and discards), then the primary action carrying
  `data-testid="data-save-export"`:
  - `'Save…'` when `typeof window.showSaveFilePicker === 'function'`
  - `'Share…'` when `navigator.canShare?.({ files: [file] })`
  - `'Download'` otherwise
- `dismissible={true}`; dismissal via any route = discard.

The label predicate is exported from `src/lib/files/download.ts` (e.g.
`saveAction(blob, fileName): 'save-as' | 'share' | 'download'`) and `saveBlob`
is refactored to use the **same** predicates internally, so the label and the
ladder cannot drift. The probe uses the real built `File`, which exists by the
time the ready state renders.

### `saving`

Same content as `ready`; primary action disabled (the ref remains the actual
re-entry guard). `dismissible={false}` while the OS share sheet / picker is
up.

### `error`

- `accent="destructive"`, title `'Export failed'`, description = the error
  message, footer **Close**. `captureException` behaviour unchanged.

### Accessibility

- Base UI Dialog provides the focus trap, ARIA roles, and Escape handling.
- On the `building → ready` transition, move focus to the primary action
  button (ref + effect; the dialog is already open so nothing refocuses
  automatically). Keyboard activation (Enter/Space) counts as user activation
  for Web Share, so the keyboard path is first-class.
- A polite live region announces **stage transitions and the ready state
  only** — four stage messages plus "Archive ready". Progress percent ticks
  are never announced (live-region throttling rule); Base UI's
  `role="progressbar"` already exposes the value for on-demand query.
- Icons `aria-hidden`; all colours/spacing via token utilities; motion via the
  existing Modal animations (reduced-motion is already handled globally).

## Cancellation

`runExport` accepts an optional `signal?: AbortSignal`, forwarded as
`Effect.runPromise(..., { signal })` (supported in Effect 3.x; the workspace
is on `^3.21.2`). The hook holds one `AbortController` per run; on Cancel it
aborts, and the rejection is swallowed iff `signal.aborted` — no dependence on
Effect's interruption error internals.

## Behaviour changes

1. "Archive ready" toast → dialog ready state (same heading text).
2. Toolbar **Save export** button removed; `pendingShare`/`onShareReady`
   props leave `DataViewToolbar`. The `data-save-export` testid moves to the
   dialog's primary action.
3. `clearSelection()` and the reload pair move from build-success to
   save-success. Dismissing the ready dialog therefore keeps the selection, so
   re-exporting after an accidental dismissal is one tap, and the
   sessions-reload lands exactly when `exportedAt` changes.
4. Partial-failure destructive toast → inline warning `Alert` in the ready
   state. The `failed_count` property on the `data_exported` event is
   unchanged.
5. Build-failure destructive toast → dialog error state.
6. The "Export canceled" toast on share-cancel is removed: the dialog
   remaining open in the ready state _is_ the not-saved/retry affordance.
7. New capability: cancelling a build in progress.

## Adjacent fix: object-URL leak

`makeBlobSink` in `src/lib/export/exportSessions.ts` calls
`URL.createObjectURL(blob)` per export, but no consumer ever uses the URL
(`handleExport` destructures only `result`/`blob`/`fileName`) and nothing
revokes it — each export pins a zip-sized allocation for the page lifetime.
The new discard path makes this worse (a "discarded" archive would survive in
memory). Fix in the same PR: stop creating the URL — the sink's
`OutputResult.url` becomes the file name (it is an identifier only in this
app-local sink) — and drop the unused `url` field from `ExportRun`. Verify at
implementation that nothing in the pipeline's `ExportReturn` consumes
`output.url` for this sink.

## Out of scope

- **True one-step on desktop Chromium** (open `showSaveFilePicker()`
  gesture-fresh on the Export tap, build, then write to the handle). Genuine
  improvement, but it inverts the step-up-auth ordering, creates a zero-byte
  file if the build fails or is cancelled (cleanup via the non-standard
  `FileSystemHandle.remove()`), and forks the flow per platform. Candidate
  follow-up once the unified dialog has shipped.
- Progress-event granularity in `@codaco/network-exporters`.
- `interviewer-classic`.

## Testing

- **`useSessionMutations.test.ts`** — rewrite around the state machine: build
  → ready; cancel aborts without an error toast; ready-dismiss discards
  without marking and retains selection; save success marks + clears selection
  - returns to idle; share-cancel returns to ready without marking; save
    failure returns to ready with toast; double-tap starts one save; step-up
    refusal never leaves idle.
- **`ExportDialog.stories.tsx`** — co-located, `autodocs`, rendered bare:
  building (indeterminate), building (with percent), ready, ready with
  partial-failure alert, error; controls for count/fileName/failedCount.
- **`download.test.ts`** — add coverage asserting `saveAction` agrees with
  the rung `saveBlob` takes under each capability combination.
- **e2e `data-management.spec.ts`** — the existing sequence (`data-export` →
  "Archive ready" visible → `data-save-export` → "Export complete" toast)
  survives with the same selectors; adjust only if the fixture interacts with
  the removed toolbar button. Assess visual baselines with the
  `preparing-e2e-visual-baselines` skill — the dialog appears mid-flow, so
  only screenshots taken during export (if any) can shift.

## Shipping

Single PR. App-lane changeset, `minor`, researcher-facing notes ("Exporting
now shows progress and finishes in a single guided dialog"). Closes #1187.
