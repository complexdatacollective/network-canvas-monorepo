// Persistence for the first-run welcome dialog. When the user dismisses it with
// "Don't show this again" checked, the preference is written to localStorage so
// the dialog is skipped on future visits; the Information toolbar button always
// re-opens it on demand.
const STORAGE_KEY = 'nc-background-creator:welcome-dismissed';

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Storage unavailable (private mode, disabled): show the welcome rather than
    // suppress it — a first-time visitor should never miss it.
    return false;
  }
}

export function setWelcomeDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(STORAGE_KEY, 'true');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to persist when storage is unavailable; the dialog simply shows
    // again next time.
  }
}
