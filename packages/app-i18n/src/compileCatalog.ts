import { parse } from '@formatjs/icu-messageformat-parser';

const CATALOG_PATTERN = /\/src\/locales\/([A-Za-z0-9-]+)\.json$/;

/** The shared catalog convention; English is extraction data, never runtime. */
const isCatalogId = (id: string): boolean => {
  const path = id.replace(/\\/g, '/');
  if (path.includes('/node_modules/')) return false;
  const matched = CATALOG_PATTERN.exec(path);
  const tag = matched?.[1];
  if (tag === undefined || tag === 'en') return false;
  try {
    Intl.getCanonicalLocales(tag);
    return true;
  } catch {
    return false;
  }
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
