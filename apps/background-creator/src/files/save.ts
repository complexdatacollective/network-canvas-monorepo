export type SaveResult = { saved: boolean };

export type Filetype = {
  description: string;
  mimeType: string;
  extension: string;
};

export const SVG_FILETYPE: Filetype = {
  description: 'SVG image',
  mimeType: 'image/svg+xml',
  extension: '.svg',
};

export const PYTHON_FILETYPE: Filetype = {
  description: 'Python script',
  mimeType: 'text/x-python',
  extension: '.py',
};

export const R_FILETYPE: Filetype = {
  description: 'R script',
  mimeType: 'text/plain',
  extension: '.R',
};

// The File System Access Save-As picker (Chromium desktop) is not in
// TypeScript's DOM lib; only the subset this module uses is declared here.
// Scoped locally to this module rather than a global.d.ts augmentation
// (compare apps/interviewer/src/global.d.ts's equivalent SaveFilePickerType/
// SaveFilePickerOptions/Window shapes). FileSystemFileHandle/createWritable
// come from lib.dom.
type SaveFilePickerType = {
  readonly description?: string;
  readonly accept: Record<string, readonly string[]>;
};

type SaveFilePickerOptions = {
  readonly suggestedName?: string;
  readonly types?: readonly SaveFilePickerType[];
};

type WindowWithSaveFilePicker = Window & {
  readonly showSaveFilePicker?: (
    options?: SaveFilePickerOptions,
  ) => Promise<FileSystemFileHandle>;
};

const windowWithSaveFilePicker: WindowWithSaveFilePicker = window;

// Ported from apps/interviewer/src/lib/files/download.ts's saveBlob capability
// ladder (see the 2026-07-08 export-save-ladder spec), generalized to accept
// caller-supplied file type metadata instead of a hard-coded ZIP type.
//
// Saves a Blob via the most reliable mechanism the platform offers. Must be
// called from within a user gesture. Rungs, in order:
// 1. File System Access Save-As picker (desktop Chromium) — the only path
//    that can confirm the bytes reached disk. A cancelled picker is a final
//    "no"; a failure after picking falls through to the anchor download.
// 2. Web Share (iOS/Android, desktop Safari) — the share sheet resolving is
//    an OS-confirmed handoff. canShare() can overpromise (#889), so any
//    failure other than the user cancelling falls through.
// 3. Object-URL <a download> — hands the file to the browser's own download
//    UI. The outcome is unobservable, so saved is reported optimistically.
export async function saveBlob(
  blob: Blob,
  suggestedName: string,
  filetype: Filetype,
): Promise<SaveResult> {
  if (typeof windowWithSaveFilePicker.showSaveFilePicker === 'function') {
    let handle: FileSystemFileHandle;
    try {
      handle = await windowWithSaveFilePicker.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: filetype.description,
            accept: { [filetype.mimeType]: [filetype.extension] },
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
  if (navigator.canShare?.({ files: [file] })) {
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
