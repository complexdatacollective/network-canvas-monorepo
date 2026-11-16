import { isPseudoLocale } from '@codaco/app-i18n/locales';
import { webStorageLocalePreference } from '@codaco/shared-consts';

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
 *
 * A development pseudo-locale is the one tag kept out, in both directions. A
 * development build declares them, so `resolveAppLocale` would honour one it
 * found here, and choosing one would replace the researcher's real choice and
 * come back on every reload. Writing one is a no-op that leaves the mirror as
 * it was, and one already here (from a build that did write it) reads as no
 * choice at all.
 */
const mirror = webStorageLocalePreference(
  () => window.localStorage,
  'studio.locale',
);

export function readLocaleMirror(): string | null {
  const stored = mirror.read();
  return isPseudoLocale(stored) ? null : stored;
}

// A device that cannot persist the mirror still honours the choice for this
// page's lifetime; the server preference restores it next visit.
export function writeLocaleMirror(locale: string): void {
  if (isPseudoLocale(locale)) return;
  mirror.write(locale);
}

export function clearLocaleMirror(): void {
  mirror.write(null);
}
