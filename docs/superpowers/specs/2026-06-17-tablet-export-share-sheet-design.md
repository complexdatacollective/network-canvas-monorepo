# Tablet export via native share sheet

Date: 2026-06-17
App: `apps/interviewer-v8`

## Problem

On the Capacitor (iPadOS / Android) build, exporting selected interview data
silently writes the zip archive into the app's `Documents/` directory with no
user interaction. The user never gets to choose where the file goes. The
expected behaviour is that clicking export presents a native **share sheet** —
which also exposes a "Save to Files" location picker — so the user controls the
destination.

The Electron (desktop) build already shows a native save dialog
(`dialog.showSaveDialog`) and the web build triggers a browser download; both are
out of scope. Only the Capacitor branch changes.

## Current behaviour

`downloadBlob(blob, suggestedName)` in `src/lib/files/download.ts` branches by
platform:

| Platform  | Behaviour                                                                  |
| --------- | -------------------------------------------------------------------------- |
| Electron  | `electronAPI.saveFile` → main-process `dialog:saveFile` native save dialog |
| Capacitor | `Filesystem.writeFile` to `Directory.Documents` — **silent, no prompt**    |
| Web       | Object-URL `<a download>` click                                            |

`downloadBlob` is called from exactly one place: `useSessionMutations.handleExport`
(`src/components/DataView/useSessionMutations.ts`). It consumes the
`DownloadResult` (`{ saved: boolean; path?: string }`) contract: `saved: true`
proceeds to `markSessionsExported` + success toast; `saved: false` shows an
"Export canceled" toast; a thrown error shows "Export failed".

## Goal

On Capacitor, clicking export presents the OS share sheet. Completing a share
action marks the sessions exported; cancelling leaves them unmarked; no archive
copy is left behind on the device.

## Design

### Scope

Change only the Capacitor branch of `downloadBlob`. The `downloadBlob` signature
and the `DownloadResult` contract are unchanged, so `useSessionMutations`, its
toasts, and `markSessionsExported` need no edits. Electron and web branches are
untouched.

### Dependency & native configuration

Add `@capacitor/share` on the v8 line, matching the rest of the Capacitor 8
stack (`@capacitor/core` `^8.x`, `@capacitor/filesystem` `^8.x`, etc.). Run
`pnpm install` then `cap sync` to regenerate the iOS Pods (Podfile) and the
Android plugin registration.

- No `capacitor.config.ts` entry — `@capacitor/share` has no config block.
- The plugin is consumed via dynamic `import('@capacitor/share')`, mirroring the
  existing `import('@capacitor/filesystem')` in the same branch, so knip sees the
  usage and no ignore entry is required.

### New Capacitor branch behaviour

Replacing the silent `Directory.Documents` write:

1. Write the zip bytes to `Directory.Cache` under `suggestedName` (ephemeral and
   shareable; nothing is left in the user's `Documents/`). Reuse the existing
   `blobToBase64` helper and the same encoding-omitted `Filesystem.writeFile`
   call already in the file. Capture the returned `uri`.
2. Guard with `Share.canShare()`. If sharing is unavailable, throw a clear error
   rather than silently falling back to a hidden write — the silent write is the
   behaviour being removed.
3. Call `Share.share({ title: suggestedName, files: [uri] })`, which presents the
   OS share sheet ("Save to Files", AirDrop, Mail, cloud-drive apps, …).
4. Resolve → return `{ saved: true }`.
5. Reject: distinguish a user cancellation (iOS rejects with a "share canceled"
   message) from a genuine failure. Cancellation → return `{ saved: false }`
   (existing "Export canceled" toast). Any other error rethrows to the caller's
   existing `catch` ("Export failed").
6. `finally`: best-effort `Filesystem.deleteFile` of the cache entry so the
   archive is not left behind, regardless of resolve/reject/cancel.

### Export-marking semantics

Completing the share counts as exported: resolve → `saved: true` →
`markSessionsExported`, consistent with the desktop/web `saved: true` path.
Cancelling marks nothing. No change to `useSessionMutations`.

### Testing

New co-located `src/lib/files/__tests__/download.test.ts` (Vitest), mocking the
`@capacitor/filesystem` and `@capacitor/share` dynamic imports and the
`isCapacitor` platform flag:

- write-to-Cache → `Share.share` called with the cache `uri` → cache file deleted
  (asserts `Filesystem.deleteFile` ran).
- `Share.share` rejecting with a cancellation → returns `{ saved: false }` and
  still deletes the cache file.
- `Share.share` rejecting with a non-cancellation error → rethrows, cache file
  still deleted.

### Out of scope

- Electron and web export paths.
- A dedicated "Save As" picker (Android Storage Access Framework /
  iOS `UIDocumentPickerViewController`); rejected during brainstorming in favour
  of the share sheet's built-in "Save to Files".
