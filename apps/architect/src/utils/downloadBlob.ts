/**
 * Hand a file to the browser's own download UI.
 *
 * Architect's one save rung. Every file the editor produces — the `.netcanvas`
 * bundle, a downloaded resource, a synthetic-data archive — reaches the
 * researcher through an object URL and an `<a download>` click, because that is
 * the mechanism every browser Architect runs in supports. The outcome is
 * unobservable (the page is never told whether the file was written), so
 * callers must report success optimistically.
 *
 * Must be called from within a user gesture: a click that arrives after the
 * gesture has been consumed is treated as a pop-up by Safari and silently
 * dropped.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on a later task rather than immediately: Firefox and WebKit read
  // the object URL asynchronously, after the synchronous click returns, so
  // revoking in the same tick can cancel the download it just started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A local `YYYY-MM-DD_HH-MM` stamp, the suffix every Architect download carries
 * so two files saved from the same protocol are distinguishable in a downloads
 * folder. Local rather than UTC: it is read by the person who pressed the
 * button, on their own clock.
 */
export function downloadTimestamp(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}
