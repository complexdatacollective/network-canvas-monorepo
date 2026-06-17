import { isCapacitor, isElectron } from '../platform/platform';

export type DownloadResult = {
  saved: boolean;
  path?: string;
};

export async function downloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
  const buffer = new Uint8Array(await blob.arrayBuffer());

  if (isElectron && window.electronAPI?.saveFile) {
    const result = await window.electronAPI.saveFile(suggestedName, buffer);
    if (result.canceled) {
      return { saved: false };
    }
    return { saved: true, path: result.path };
  }

  if (isCapacitor) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = await blobToBase64(blob);
    // Write to Cache (ephemeral, shareable) rather than Documents so we leave no
    // copy behind; the share sheet lets the user choose the real destination.
    const { uri } = await Filesystem.writeFile({
      path: suggestedName,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      const { value: canShare } = await Share.canShare();
      if (!canShare) {
        throw new Error('Sharing is not available on this device');
      }
      await Share.share({ title: suggestedName, files: [uri] });
      return { saved: true };
    } catch (cause) {
      if (isShareCanceled(cause)) {
        return { saved: false };
      }
      throw cause;
    } finally {
      try {
        await Filesystem.deleteFile({
          path: suggestedName,
          directory: Directory.Cache,
        });
      } catch {
        // Best-effort cleanup; a leftover cache entry must not mask the result.
      }
    }
  }

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader did not return a string'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

// `@capacitor/share` rejects when the user dismisses the sheet; treat a
// "cancel" message as a non-error cancellation. The rejection may arrive as an
// Error, a bare string, or a plugin object carrying `message`, so normalise
// before matching rather than assuming an Error instance.
function isShareCanceled(cause: unknown): boolean {
  return /cancel/i.test(errorMessage(cause));
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
