# Interviewer export: deterministic save ladder, no confirmation dialog

**Date:** 2026-07-08
**Status:** Approved
**Scope:** `apps/interviewer` only. Follow-up to PR #893 (issue #889).

## Problem

The bulk-export flow ends in `shareOrDownloadBlob`. When the archive is handed
to the browser via the object-URL `<a download>` fallback, the app cannot
observe whether the file was actually saved, so it shows a
"Did the archive download?" choice dialog before stamping `exportedAt`. The
stamp is load-bearing — `buildDeleteProtocolMessage` and the Data view's
export-status filter use it to warn before destructive deletes — but asking
the researcher to vouch for the browser is unacceptable UX.

On desktop Chromium (the dominant research platform, and where issue #889
made the download fallback the _common_ path), a save mechanism exists that
reports success deterministically: the File System Access API. The dialog
solves the observability problem at the wrong layer.

## Decision

Replace the save mechanism with a three-rung capability ladder and delete the
confirmation dialog. `exportedAt` is stamped from the save outcome alone.

### Rung 1 — File System Access API (desktop Chrome/Edge)

If `typeof window.showSaveFilePicker === 'function'`: open the native Save-As
picker (`suggestedName`, `.zip` / `application/zip` type hint), then
`createWritable()` → `write(blob)` → `close()`.

- `close()` resolves → the bytes are on disk → **saved**.
- Picker cancelled (`AbortError`) → **not saved**, no fallthrough. The
  researcher declined; offering a second save mechanism would recreate the
  nagging this design removes.
- Write failure after a successful pick (disk full, permissions) → fall
  through to rung 3 so the export can still land somewhere.

### Rung 2 — Web Share (iOS/Android, desktop Safari)

Unchanged from PR #893: if `navigator.canShare?.({ files })`, share.
Resolved → **saved**. Cancelled → **not saved**. Any other rejection
(`NotAllowedError` etc.) → fall through to rung 3.

### Rung 3 — `<a download>` anchor (desktop Firefox, Brave)

Fire the object-URL download and report **saved** optimistically. This rung
is unobservable by definition; the false-positive risk is accepted and
confined to browsers with neither API (decision: optimistic, 2026-07-08).
Browsers surface downloads in their own UI, so a failure is visible to the
researcher even though it is invisible to the app.

## API change

`src/lib/files/download.ts`:

- `shareOrDownloadBlob(blob, suggestedName)` → `saveBlob(blob, suggestedName)`.
- `DownloadResult` becomes `{ saved: boolean }`; the `confirmed` field and the
  confirmed/unconfirmed distinction are deleted.

`src/components/DataView/useSessionMutations.ts` (`handleShareReady`):

- `saved: true` → `markSessionsExported` + "Export complete" toast, clear
  `pendingShare`, reload.
- `saved: false` → "Export canceled" toast, `pendingShare` retained for retry.
- The `dialog.openDialog` "Did the archive download?" block is deleted.
  `useDialog` remains for the delete flow.
- No prop changes to `DataView`/`DataViewToolbar`; `pendingShare`/`onShareReady`
  wiring is untouched.

`src/global.d.ts`: declare `Window.showSaveFilePicker?` with a minimal options
type (`suggestedName`, `types`), following the existing `LaunchQueue` /
`navigator.standalone` declarations for non-standard APIs.
`FileSystemFileHandle` and `createWritable` are already in TypeScript's DOM
lib. No type assertions.

## Behavior by platform

| Platform                       | "Save export" experience      | `exportedAt` signal            |
| ------------------------------ | ----------------------------- | ------------------------------ |
| Desktop Chrome/Edge            | Native Save-As picker         | Deterministic (write closed)   |
| iOS / Android / desktop Safari | Share sheet                   | Deterministic (share resolved) |
| Desktop Firefox, Brave         | Download starts in browser UI | Optimistic                     |

No platform asks the researcher to confirm anything after saving.

## Error handling

A hard failure in rungs 1–2 falls to rung 3. A failure that escapes the
ladder surfaces through the existing catch in `handleShareReady`
(`captureException` + destructive toast, `pendingShare` retained for retry).

## Testing

- `download.test.ts`: picker success / picker cancel / write-failure
  fallthrough; share success / cancel / failure fallthrough (picker absent);
  anchor rung when neither API exists.
- `useSessionMutations.test.ts`: saved → marked exported; not saved → not
  marked, retry retained. The four dialog-flow tests are removed.
- Live verification in Chromium (Playwright) by stubbing each rung, as the
  native picker cannot be driven headlessly.

## Shipping

Separate PR stacked on #893. App-lane changeset, `minor`, researcher-facing
notes.
