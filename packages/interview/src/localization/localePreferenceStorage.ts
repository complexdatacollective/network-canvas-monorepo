import type { LocaleTag } from '@codaco/protocol-validation';

/**
 * The participant's language choice is not interview data, so no host stores
 * it. It lives in the interview's own state for the session, and is kept in
 * this tab's `sessionStorage` so a reload or a resume in the same tab does not
 * revert it. It is never shared between interviews or tabs, and is gone once
 * the tab closes.
 *
 * Storage can be missing or refuse access (a private window, blocked site
 * data, a sandboxed frame, no `window` while server rendering). Then the
 * choice simply lasts as long as the interview stays mounted.
 */
const STORAGE_KEY_PREFIX = 'network-canvas:interview-locale-preference:';

const storageKey = (interviewId: string) =>
  `${STORAGE_KEY_PREFIX}${interviewId}`;

const sessionStorageOrNull = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * The language this tab last chose for the interview, when the protocol still
 * declares it; otherwise `null`.
 */
export function readStoredLocalePreference(
  interviewId: string,
  declaredLocales: readonly LocaleTag[],
): LocaleTag | null {
  try {
    const stored = sessionStorageOrNull()?.getItem(storageKey(interviewId));
    if (stored == null) return null;
    return declaredLocales.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLocalePreference(
  interviewId: string,
  locale: LocaleTag,
): void {
  try {
    sessionStorageOrNull()?.setItem(storageKey(interviewId), locale);
  } catch {
    // Storage is full or refused: the choice stays in memory only.
  }
}
