// `confirmed` distinguishes an observable save (Web Share resolved, so the OS
// reported success) from an unobservable one (the object-URL <a download>
// fires the Save dialog but exposes no success/cancel signal). Callers must
// not treat an unconfirmed save as proof a file was written.
export type DownloadResult = { saved: boolean; confirmed: boolean };

// Shares or saves a Blob. Must be called from within a user gesture so
// Web Share / the download is allowed to proceed. Web Share is preferred when
// the platform can share files (iOS/Android/desktop Safari + Chrome), otherwise
// falls back to an object-URL <a download>. canShare({files}) only reports
// that the API accepts the payload, not that the OS can actually present a
// share sheet — desktop Chromium can pass canShare and then reject share()
// with NotAllowedError (#889) — so any share failure other than the user
// cancelling also falls through to the download.
export async function shareOrDownloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
  const file = new File([blob], suggestedName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: suggestedName });
      return { saved: true, confirmed: true };
    } catch (cause) {
      if (isShareCanceled(cause)) return { saved: false, confirmed: false };
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
  // The download was triggered, but the browser gives no signal for whether
  // the user completed or cancelled the Save dialog — report it as unconfirmed
  // so the caller can seek explicit confirmation before marking as exported.
  return { saved: true, confirmed: false };
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
