import type { LocaleTag } from '@codaco/protocol-validation';
import { webStorageLocalePreference } from '@codaco/shared-consts';

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

/** The choice kept for one interview in this tab. */
const preferenceFor = (interviewId: string) =>
  webStorageLocalePreference(
    () => window.sessionStorage,
    `${STORAGE_KEY_PREFIX}${interviewId}`,
  );

/**
 * The language this tab last chose for the interview, when the protocol still
 * declares it; otherwise `null`.
 */
export function readStoredLocalePreference(
  interviewId: string,
  declaredLocales: readonly LocaleTag[],
): LocaleTag | null {
  const stored = preferenceFor(interviewId).read();
  return stored !== null && declaredLocales.includes(stored) ? stored : null;
}

/** Storage that is full or refused leaves the choice in memory only. */
export function storeLocalePreference(
  interviewId: string,
  locale: LocaleTag,
): void {
  preferenceFor(interviewId).write(locale);
}
