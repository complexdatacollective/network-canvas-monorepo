# Interviewer export: deterministic save ladder, no confirmation dialog

**Date:** 2026-07-08
**Status:** Approved; amended 2026-08-13 and 2026-11-03
**Scope:** `apps/interviewer` only. Follow-up to PR #893 (issue #889).
Since 2026-11-03 the ladder lives in `@codaco/fresco-ui/utils/saveBlob` and
also serves the Background Creator.

> **Amendment (2026-08-13):** rung 2 is handheld-only. Desktop Safari
> advertises file sharing, so the ladder sent macOS researchers to the OS
> share sheet when they only wanted the archive in their Downloads folder
> (community thread #258). `canShareFile` is now gated on
> `isHandheldPlatform()` (iOS/iPadOS/Android), so desktop Safari and desktop
> Firefox both take rung 3 and the file downloads directly. Rung 2 and the
> "Behavior by platform" table below have been rewritten to match; the rungs
> themselves are otherwise unchanged from the approved design.

> **Amendment (2026-11-03):** a picker that never appeared is not a cancel.
> A Chromium build with no file dialog to show (an embedded browser such as
> Claude desktop's browser pane, or headless Chrome) rejects
> `showSaveFilePicker` with the same `AbortError` a person's cancel produces,
> but within one round trip to the browser process (13–24 ms measured), and
> the ladder read that as "not saved", so "Save…" did nothing. An
> `AbortError` sooner than 200 ms now falls through to rung 3; a later one is
> still a final "no". The Background Creator had ported this ladder on
> 2026-07-17 and missed the 2026-08-13 amendment, so both copies were merged
> into `@codaco/fresco-ui/utils/saveBlob`, which takes the picker's file type
> (`{ description, mimeType, extension }`) from the caller instead of
> hard-coding ZIP. The handheld check that `src/lib/platform.ts` held moved
> into that module, and the `Window.showSaveFilePicker` declaration moved
> from `src/global.d.ts` into it as module-local types. Rung 1 below has been
> updated to match.

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
- Picker rejected with `AbortError` within 200 ms → no picker was shown (the
  2026-11-03 amendment) → fall through to rung 3.
- Write failure after a successful pick (disk full, permissions) → fall
  through to rung 3 so the export can still land somewhere.

### Rung 2 — Web Share (iOS / iPadOS / Android)

If `isHandheldPlatform()` and `navigator.canShare?.({ files })`, share.
Resolved → **saved**. Cancelled → **not saved**. Any other rejection
(`NotAllowedError` etc.) → fall through to rung 3. The handheld gate is the
2026-08-13 amendment: a desktop browser has a Downloads folder and a downloads
UI, so its share sheet is a detour, not a destination.

### Rung 3 — `<a download>` anchor (desktop Safari, Firefox, Brave)

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
| iOS / iPadOS / Android         | Share sheet                   | Deterministic (share resolved) |
| Desktop Safari, Firefox, Brave | Download starts in browser UI | Optimistic                     |

No platform asks the researcher to confirm anything after saving.

## Error handling

A hard failure in rungs 1–2 falls to rung 3. A failure that escapes the
ladder surfaces through the existing catch in `handleShareReady`
(`captureException` + destructive toast, `pendingShare` retained for retry).

## Testing

- `download.test.ts` (since 2026-11-03, fresco-ui's
  `src/utils/__tests__/saveBlob.test.ts`): picker success / picker cancel /
  picker that never appeared / write-failure fallthrough; share success /
  cancel / failure fallthrough (picker absent);
  anchor rung when neither API exists; the handheld gate (desktop Safari
  downloads despite `canShare` returning true, iPhone/Android/iPadOS share —
  iPadOS in both its Mac-like desktop mode and its self-identifying mobile
  mode).
- `useSessionMutations.test.ts`: saved → marked exported; not saved → not
  marked, retry retained. The four dialog-flow tests are removed.
- Live verification in Chromium (Playwright) by stubbing each rung, as the
  native picker cannot be driven headlessly.

## Shipping

Separate PR stacked on #893. App-lane changeset, `minor`, researcher-facing
notes.
