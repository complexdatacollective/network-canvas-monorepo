import { isHandheldPlatform } from '~/lib/platform';

export type DownloadResult = { saved: boolean };

export type SaveAction = 'save-as' | 'share' | 'download';

function getSavePicker(): NonNullable<Window['showSaveFilePicker']> | null {
  // Bound to window: a detached Web-IDL method throws "Illegal invocation"
  // when called, which would silently degrade the picker rung to the anchor
  // download.
  return typeof window.showSaveFilePicker === 'function'
    ? window.showSaveFilePicker.bind(window)
    : null;
}

function canShareFile(file: File): boolean {
  // Desktop Safari advertises file sharing, but a desktop browser already has
  // a downloads folder and a downloads UI: routing the archive through the
  // macOS share sheet made researchers pick a destination app for a file they
  // only wanted on disk (community #258). The share rung exists for handheld
  // platforms, where no such download destination is reachable.
  if (!isHandheldPlatform()) return false;
  return navigator.canShare?.({ files: [file] }) ?? false;
}

// Predicts the rung saveBlob will take for this file, so UI can label the
// action that triggers it ("Save…" / "Share…" / "Download"). Uses the same
// predicates as saveBlob; the prediction can still overshoot when share
// fails at call time and falls through to the download rung (#889).
export function saveAction(blob: Blob, suggestedName: string): SaveAction {
  if (getSavePicker()) return 'save-as';
  const file = new File([blob], suggestedName, { type: blob.type });
  if (canShareFile(file)) return 'share';
  return 'download';
}

// Saves a Blob via the most reliable mechanism the platform offers. Must be
// called from within a user gesture. Rungs, in order (see the 2026-07-08
// export-save-ladder spec):
// 1. File System Access Save-As picker (desktop Chromium) — the only path
//    that can confirm the bytes reached disk. A cancelled picker is a final
//    "no"; a failure after picking falls through to the anchor download.
// 2. Web Share (iOS/iPadOS/Android only) — the share sheet resolving is an
//    OS-confirmed handoff, and on a handheld it is the only way to put the
//    file somewhere the researcher can reach. canShare() can overpromise
//    (#889), so any failure other than the user cancelling falls through.
// 3. Object-URL <a download> — hands the file to the browser's own download
//    UI. The outcome is unobservable, so saved is reported optimistically.
//    This is the desktop-Safari and desktop-Firefox rung.
export async function saveBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
  const showSaveFilePicker = getSavePicker();
  if (showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      handle = await showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'ZIP archive',
            accept: { 'application/zip': ['.zip'] },
          },
        ],
      });
    } catch (cause) {
      if (isAbortError(cause)) return { saved: false };
      return downloadViaObjectUrl(blob, suggestedName);
    }
    try {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { saved: true };
    } catch {
      return downloadViaObjectUrl(blob, suggestedName);
    }
  }

  const file = new File([blob], suggestedName, { type: blob.type });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: suggestedName });
      return { saved: true };
    } catch (cause) {
      if (isShareCanceled(cause)) return { saved: false };
    }
  }

  return downloadViaObjectUrl(blob, suggestedName);
}

function downloadViaObjectUrl(
  blob: Blob,
  suggestedName: string,
): DownloadResult {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true };
}

// Structural check rather than `instanceof Error`: DOMException predates the
// spec change making it an Error subclass, and not every environment (jsdom
// included) reflects that inheritance.
function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    cause.name === 'AbortError'
  );
}

function isShareCanceled(cause: unknown): boolean {
  return isAbortError(cause) || /cancel/i.test(errorMessage(cause));
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'message' in cause &&
    typeof cause.message === 'string'
  ) {
    return cause.message;
  }
  return '';
}
