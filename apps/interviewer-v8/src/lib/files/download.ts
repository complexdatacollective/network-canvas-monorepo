export type DownloadResult = { saved: boolean };

// Shares or saves a Blob. Must be called from within a user gesture so
// Web Share / the download is allowed to proceed. Web Share is preferred when
// the platform can share files (iOS/Android/desktop Safari + Chrome), otherwise
// falls back to an object-URL <a download>.
export async function shareOrDownloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
  const file = new File([blob], suggestedName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: suggestedName });
      return { saved: true };
    } catch (cause) {
      if (isShareCanceled(cause)) return { saved: false };
      throw cause;
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

function isShareCanceled(cause: unknown): boolean {
  if (cause instanceof Error && cause.name === 'AbortError') return true;
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
