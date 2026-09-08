import type { MessageFormatElement } from 'react-intl';

/**
 * Metadata for one app UI locale. Structurally identical to the protocol
 * localization design's `LocaleMetadata` so switch UI can present either.
 * App locales are a closed, maintainer-curated set: `label` is a static
 * autonym reviewed in the PR that adds the locale, never derived at runtime.
 */
export type AppLocale = Readonly<{
  locale: string;
  label: string;
  direction: 'ltr' | 'rtl';
}>;

/**
 * A locale's messages. The two value forms are the two build modes, not a
 * choice a host makes: ICU source strings under the dev server and vitest,
 * pre-parsed AST in production, where `appI18n()` compiles every catalog and
 * drops the ICU parser from the bundle. A catalog that reaches a production
 * bundle as strings has nothing left to parse it, so a host that assembles one
 * outside the `src/locales/<tag>.json` the plugin compiles has to compile it
 * itself.
 */
export type CatalogMessages = Readonly<
  Record<string, string | MessageFormatElement[]>
>;

const canonicalOf = (value: string): string | undefined => {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
};

/**
 * Validates a locale registry at definition time: canonical BCP 47 tags,
 * unique, with non-empty labels. Throws on misconfiguration — a registry is
 * static data, so an invalid entry is a programming error, not user input.
 */
export function defineAppLocales<const T extends readonly AppLocale[]>(
  locales: T,
): T {
  const seen = new Set<string>();
  for (const entry of locales) {
    if (canonicalOf(entry.locale) !== entry.locale) {
      throw new Error(
        `defineAppLocales: "${entry.locale}" is not a canonical BCP 47 tag`,
      );
    }
    if (seen.has(entry.locale)) {
      throw new Error(`defineAppLocales: duplicate locale "${entry.locale}"`);
    }
    seen.add(entry.locale);
    if (entry.label.trim().length === 0) {
      throw new Error(`defineAppLocales: "${entry.locale}" has an empty label`);
    }
  }
  return locales;
}

/**
 * Every locale any in-repo app ships a UI in. Shared-package catalogs
 * (common.*, frescoUi.*, interview.*) must be complete for each entry; app
 * registries must be subsets. Extend this list in the same PR that adds a
 * locale to any app — the catalog guards fail until shared catalogs exist.
 */
export const ecosystemLocales = defineAppLocales([
  { locale: 'en', label: 'English', direction: 'ltr' },
  { locale: 'en-GB', label: 'English (UK)', direction: 'ltr' },
  { locale: 'es', label: 'Español', direction: 'ltr' },
]);

/**
 * Development-only pseudo-locale: message output is accented and expanded at
 * format time so hardcoded strings and clipped layouts are visible by eye.
 * Never include it in a production registry and never persist it.
 */
export const PSEUDO_LOCALE = 'en-XA';

export const pseudoAppLocale: AppLocale = {
  locale: PSEUDO_LOCALE,
  label: 'Þséûðö Éñglîsh (en-XA)',
  direction: 'ltr',
};

/**
 * Merges catalogs for one locale. Merge order at a host is
 * common → shared packages → app; ids are dot-namespaced per workspace, so
 * later-wins shallow merging is a formality rather than a conflict policy.
 */
export function mergeCatalogs(
  ...catalogs: readonly CatalogMessages[]
): CatalogMessages {
  return Object.assign({}, ...catalogs) as CatalogMessages;
}
