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
  { locale: 'zh-Hans', label: '简体中文', direction: 'ltr' },
  { locale: 'zh-Hant', label: '繁體中文', direction: 'ltr' },
  { locale: 'de', label: 'Deutsch', direction: 'ltr' },
  { locale: 'nl', label: 'Nederlands', direction: 'ltr' },
  { locale: 'pt-BR', label: 'Português (Brasil)', direction: 'ltr' },
  { locale: 'it', label: 'Italiano', direction: 'ltr' },
  { locale: 'fr', label: 'Français', direction: 'ltr' },
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

/**
 * One package's catalogs: for each locale it translates, a dynamic `import()`
 * of its `src/locales/<tag>.json`. Behind the import every language is its
 * own chunk, so a host downloads, parses and keeps in memory only the one it
 * renders — and still has the rest a request away, which for an offline PWA
 * means its precache, not the network.
 *
 * English has no entry and needs none: every descriptor carries its own
 * `defaultMessage`, and `en.json` is extraction data, never a runtime input.
 */
export type CatalogLoaders = Readonly<
  Partial<Record<string, () => Promise<Readonly<{ default: CatalogMessages }>>>>
>;

/** What a locale nobody translates renders from: its descriptors alone. */
const NO_CATALOG: CatalogMessages = Object.freeze({});

/**
 * Loads one locale from each package and merges them, in the order given —
 * the same common → shared packages → app order `mergeCatalogs` documents.
 * A package with no catalog for the locale contributes nothing.
 */
export async function loadCatalog(
  locale: string,
  ...packages: readonly CatalogLoaders[]
): Promise<CatalogMessages> {
  const modules = await Promise.all(
    packages.map((loaders) => loaders[locale]?.()),
  );
  return mergeCatalogs(
    ...modules.map((module) => module?.default ?? NO_CATALOG),
  );
}

/**
 * A host's merged catalogs, loaded one locale at a time and kept once
 * loaded. Read synchronously with `peek` (which is how a render reads it) and
 * filled with `load` (which is how a host gets a locale ready before it
 * renders it).
 */
export type CatalogSource = Readonly<{
  /**
   * The merged catalog for a locale that has finished loading, otherwise
   * undefined. A locale no package translates — the source language, the
   * pseudo-locale — has nothing to wait for and is always ready.
   */
  peek: (locale: string) => CatalogMessages | undefined;
  /**
   * Loads a locale once: concurrent and repeated calls share the one request.
   * A failed load is replaced by a fresh one on the next call, rather than
   * replaying the failure for the rest of the session.
   */
  load: (locale: string) => Promise<CatalogMessages>;
  /**
   * The load a locale already has — finished, in flight, or the last one to
   * fail — or a new one if it has none. A render that suspends on a load needs
   * this rather than `load`: it is handed the failure, which reaches its error
   * boundary, where `load` would start another attempt on every retry and the
   * render would never settle.
   */
  attempt: (locale: string) => Promise<CatalogMessages>;
  /** Called after any locale finishes loading. Returns the unsubscribe. */
  subscribe: (onLoad: () => void) => () => void;
}>;

/**
 * The catalog source for a host that renders messages from every package
 * given, merged in argument order (common → shared packages → app).
 */
export function createCatalogSource(
  ...packages: readonly CatalogLoaders[]
): CatalogSource {
  const loaded = new Map<string, CatalogMessages>();
  const inFlight = new Map<string, Promise<CatalogMessages>>();
  const failed = new Map<string, Promise<CatalogMessages>>();
  const listeners = new Set<() => void>();
  const translated = (locale: string) =>
    packages.some((loaders) => loaders[locale] !== undefined);

  const current = (locale: string): Promise<CatalogMessages> | undefined => {
    const ready = translated(locale) ? loaded.get(locale) : NO_CATALOG;
    if (ready !== undefined) return Promise.resolve(ready);
    return inFlight.get(locale);
  };

  const start = (locale: string): Promise<CatalogMessages> => {
    failed.delete(locale);
    const request: Promise<CatalogMessages> = loadCatalog(
      locale,
      ...packages,
    ).then(
      (messages) => {
        inFlight.delete(locale);
        loaded.set(locale, messages);
        for (const listener of listeners) listener();
        return messages;
      },
      (error: unknown) => {
        inFlight.delete(locale);
        failed.set(locale, request);
        throw error;
      },
    );
    inFlight.set(locale, request);
    return request;
  };

  return {
    peek: (locale) => (translated(locale) ? loaded.get(locale) : NO_CATALOG),
    load: (locale) => current(locale) ?? start(locale),
    attempt: (locale) => current(locale) ?? failed.get(locale) ?? start(locale),
    subscribe: (onLoad) => {
      listeners.add(onLoad);
      return () => {
        listeners.delete(onLoad);
      };
    },
  };
}
