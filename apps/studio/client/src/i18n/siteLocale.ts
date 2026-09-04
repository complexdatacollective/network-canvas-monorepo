import { defaultSiteLocale } from '@codaco/shared-consts';
import type { SiteLocale } from '@codaco/shared-consts';

/**
 * Maps the active app locale onto the shared site chrome's own locale set
 * (2026-09-04 localization design §5.4): `SiteNavigation` carries its own
 * self-contained catalog keyed by `SiteLocale`, which is a different registry
 * from Studio's. A small explicit mapping, validated by a test against
 * `supportedSiteLocales`, rather than a matcher dependency — the app registry
 * is closed, so every entry is known here.
 *
 * The dev-only pseudo-locale (and any unmapped tag) falls back to the site
 * default: the site header is shared chrome outside the pseudo-transform.
 */
export const SITE_LOCALE_BY_APP_LOCALE: Readonly<Record<string, SiteLocale>> = {
  'en': 'en-US',
  'en-GB': 'en-GB',
};

export function siteLocaleFor(appLocale: string): SiteLocale {
  return SITE_LOCALE_BY_APP_LOCALE[appLocale] ?? defaultSiteLocale;
}
