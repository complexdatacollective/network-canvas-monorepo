import { parse } from '@formatjs/icu-messageformat-parser';

const CATALOG_PATTERN = /\/src\/locales\/([A-Za-z0-9-]+\.json)$/;

/**
 * The locale a filename in a locales directory is a runtime catalog for, or
 * undefined if it is not one: the name has to be a bare locale tag, and not
 * English, which is extraction data rather than runtime.
 *
 * A tag may not contain a dot, which is what keeps the provenance sidecars
 * committed beside these files (`es.source.json` — see
 * `translationSourcePath`) from ever being read as catalogs, compiled, or
 * reaching a bundle.
 */
export const runtimeCatalogLocale = (fileName: string): string | undefined => {
  const tag = /^([A-Za-z0-9-]+)\.json$/.exec(fileName)?.[1];
  if (tag === undefined || tag === 'en') return undefined;
  try {
    Intl.getCanonicalLocales(tag);
    return tag;
  } catch {
    return undefined;
  }
};

/** The shared catalog convention; English is extraction data, never runtime. */
const isCatalogId = (id: string): boolean => {
  const path = id.replace(/\\/g, '/');
  if (path.includes('/node_modules/')) return false;
  const fileName = CATALOG_PATTERN.exec(path)?.[1];
  return fileName !== undefined && runtimeCatalogLocale(fileName) !== undefined;
};

const isCatalog = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string');

/**
 * Compile the same catalog files for Vite and Next. Decline unrelated JSON,
 * including other packages' localization data and nested next-intl catalogs.
 * Published workspace packages already ship AST in their dist JavaScript.
 */
export function compileCatalog(code: string, id: string): string | undefined {
  if (!isCatalogId(id)) return undefined;
  const catalog: unknown = JSON.parse(code);
  if (!isCatalog(catalog)) return undefined;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(catalog).map(([messageId, message]) => [
        messageId,
        parse(message),
      ]),
    ),
  );
}
