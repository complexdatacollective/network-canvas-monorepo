/**
 * The device mirror of the researcher's UI-language preference (2026-09-04
 * localization design §5.1): what lets a returning researcher's own device
 * paint in their language before identity loads. The server-stored preference
 * is authoritative and overwrites this the moment `me` resolves.
 *
 * It deliberately survives sign-out: a shared machine reveals at most a
 * previous language choice, and the next sign-in's server preference replaces
 * it immediately.
 *
 * Storage can throw (private browsing, storage policy), so every access is
 * guarded; a mirror that cannot be read or written degrades to negotiation.
 * Values are not validated here — `resolveAppLocale` ignores a stored tag
 * that matches no declared locale.
 */
const MIRROR_KEY = 'studio.locale';

export function readLocaleMirror(): string | null {
  try {
    return window.localStorage.getItem(MIRROR_KEY);
  } catch {
    return null;
  }
}

export function writeLocaleMirror(locale: string): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, locale);
  } catch {
    // A device that cannot persist the mirror still honours the choice for
    // this page's lifetime; the server preference restores it next visit.
  }
}

export function clearLocaleMirror(): void {
  try {
    window.localStorage.removeItem(MIRROR_KEY);
  } catch {
    // See writeLocaleMirror.
  }
}
