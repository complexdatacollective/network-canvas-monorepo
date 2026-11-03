export type SaveResult = { saved: boolean };

export type SaveAction = 'save-as' | 'share' | 'download';

// What the Save-As picker offers as the file's type: the description is shown
// to the person, so callers pass it already translated.
export type Filetype = {
  description: string;
  mimeType: string;
  extension: string;
};

// The File System Access Save-As picker (Chromium desktop) is not in
// TypeScript's DOM lib; only the subset this module uses is declared here,
// scoped to this module rather than a global augmentation that consumers
// would have to import to see. FileSystemFileHandle/createWritable come from
// lib.dom.
type SaveFilePickerType = {
  readonly description?: string;
  readonly accept: Record<string, readonly string[]>;
};

type SaveFilePickerOptions = {
  readonly suggestedName?: string;
  readonly types?: readonly SaveFilePickerType[];
};

type ShowSaveFilePicker = (
  options?: SaveFilePickerOptions,
) => Promise<FileSystemFileHandle>;

type WindowWithSaveFilePicker = Window & {
  readonly showSaveFilePicker?: ShowSaveFilePicker;
};

// A Chromium build with no file dialog to show — an embedded browser such as
// an Electron app's web view, or headless Chrome — rejects the picker with the
// same AbortError a person's cancel produces, but within one round trip to the
// browser process (13–24 ms measured). Timing is the only difference: the page
// keeps focus and user activation either way. So an AbortError sooner than
// this is read as "the picker never appeared" and the save downloads instead
// of doing nothing. Dismissing a panel a person has seen takes longer than
// this, since visual reaction time alone is about 200 ms. The rule can misread
// in two directions. A slower no-dialog rejection still reads as a cancel, so
// the click does nothing, as before this rule. An Escape that reaches a real
// panel inside the window still downloads, which costs an unwanted file
// rather than a lost one.
const PICKER_NEVER_SHOWN_MS = 200;

function getSavePicker(): ShowSaveFilePicker | null {
  // Read at call time rather than import time, so the module stays importable
  // where there is no window. Bound to window: a detached Web-IDL method
  // throws "Illegal invocation" when called, which would silently degrade the
  // picker rung to the anchor download.
  const target: WindowWithSaveFilePicker = window;
  return typeof target.showSaveFilePicker === 'function'
    ? target.showSaveFilePicker.bind(target)
    : null;
}

// Whether this is a handheld OS (iOS, iPadOS, Android), where the browser has
// no download manager or user-reachable file system: a file has to be handed
// to the OS through the share sheet to end up anywhere the person can find it.
// Every desktop browser — Safari included — saves an <a download> to the
// Downloads folder and surfaces it in its own downloads UI, so a share sheet
// there is an unwanted detour.
function isHandheldPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  // iPad is in this list because iPadOS still names itself whenever it is not
  // in desktop mode: Safari's per-site "Request Mobile Website", the global
  // Request Desktop Website toggle turned off, iPadOS 12 and earlier, and
  // in-app web views. There the platform string is 'iPad', so the Mac check
  // below would miss it.
  if (/Android|iPhone|iPod|iPad/i.test(ua)) return true;
  // In its default desktop mode, iPadOS 13+ presents itself as a Mac and its
  // user agent says nothing about iPad. A real Mac has no touchscreen, so
  // maxTouchPoints is what separates them.
  return (
    typeof navigator.platform === 'string' &&
    navigator.platform.startsWith('Mac') &&
    navigator.maxTouchPoints > 0
  );
}

function canShareFile(file: File): boolean {
  // Desktop Safari advertises file sharing, but a desktop browser already has
  // a downloads folder and a downloads UI: routing a file through the macOS
  // share sheet made people pick a destination app for a file they only
  // wanted on disk (community #258). The share rung exists for handheld
  // platforms, where no such download destination is reachable.
  if (!isHandheldPlatform()) return false;
  return navigator.canShare?.({ files: [file] }) ?? false;
}

// Predicts the rung saveBlob will take for this file, so UI can label the
// action that triggers it ("Save…" / "Share…" / "Download"). Uses the same
// predicates as saveBlob. The prediction can still overshoot: share can fail
// at call time and fall through to the download rung (#889), and a picker
// that rejects before it could have been shown downloads instead.
export function saveAction(blob: Blob, suggestedName: string): SaveAction {
  if (getSavePicker()) return 'save-as';
  const file = new File([blob], suggestedName, { type: blob.type });
  if (canShareFile(file)) return 'share';
  return 'download';
}

// Saves a Blob via the most reliable mechanism the platform offers. Must be
// called from within a user gesture, with no `await` before it. Rungs, in
// order (see docs/superpowers/specs/2026-07-08-interviewer-export-save-ladder-design.md
// and its amendments):
// 1. File System Access Save-As picker (desktop Chromium) — the only path
//    that can confirm the bytes reached disk. A cancelled picker is a final
//    "no"; a picker that never appeared, or a failure after picking, falls
//    through to the anchor download.
// 2. Web Share (iOS/iPadOS/Android only) — the share sheet resolving is an
//    OS-confirmed handoff, and on a handheld it is the only way to put the
//    file somewhere the person can reach. canShare() can overpromise (#889),
//    so any failure other than the user cancelling falls through.
// 3. Object-URL <a download> — hands the file to the browser's own download
//    UI. The outcome is unobservable, so saved is reported optimistically.
//    This is the desktop-Safari and desktop-Firefox rung.
export async function saveBlob(
  blob: Blob,
  suggestedName: string,
  filetype: Filetype,
): Promise<SaveResult> {
  const showSaveFilePicker = getSavePicker();
  if (showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    const pickerOpenedAt = performance.now();
    try {
      handle = await showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: filetype.description,
            accept: { [filetype.mimeType]: [filetype.extension] },
          },
        ],
      });
    } catch (cause) {
      const pickerNeverShown =
        performance.now() - pickerOpenedAt < PICKER_NEVER_SHOWN_MS;
      if (isAbortError(cause) && !pickerNeverShown) return { saved: false };
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

function downloadViaObjectUrl(blob: Blob, suggestedName: string): SaveResult {
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
