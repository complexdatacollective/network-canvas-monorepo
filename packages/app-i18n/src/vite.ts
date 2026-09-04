import { parse } from '@formatjs/icu-messageformat-parser';
import formatjs from '@formatjs/unplugin/vite';
import type { PluginOption } from 'vite';

const CATALOG_PATTERN = /\/src\/locales\/([A-Za-z0-9-]+)\.json$/;

type TransformResult =
  | { code: string; map: null; moduleType: 'js' }
  | undefined;

/**
 * Whether a module id names a catalog this plugin owns. `…/locales/<tag>.json`
 * on its own claims far too much — every project and half the libraries in a
 * dependency tree keep a directory of that name — and a claimed file gets its
 * string values replaced by AST arrays, so a wrong claim either hands some
 * other runtime a shape it cannot read or fails the build in the ICU parser.
 * Hence the whole of the design's shape: catalogs live in the host's own
 * `src/locales`, named for the locale they carry.
 *
 * `en.json` is excluded within that: it is the extraction artifact the catalog
 * guards read, never imported at runtime.
 *
 * Ids are matched on a separator-normalised copy, the way this repo's other
 * id-matching Vite plugins do (`packages/interview/vite.config.ts`). A
 * Windows id can carry `\` separators, and the silent failure — no match, so
 * no compilation — would not surface until someone noticed the ICU parser
 * back in a production bundle.
 */
const isCatalogId = (id: string): boolean => {
  const path = id.replace(/\\/g, '/');
  if (path.includes('/node_modules/')) return false;
  const matched = CATALOG_PATTERN.exec(path);
  if (matched === null) return false;
  const tag = matched[1]!;
  if (tag === 'en') return false;
  try {
    Intl.getCanonicalLocales(tag);
    return true;
  } catch {
    return false;
  }
};

/**
 * A catalog is id → ICU string and nothing else. Anything nested belongs to
 * another i18n runtime that happens to file its translations the same way; a
 * real catalog that acquired a non-string value fails this package's own
 * guards, which is where that gets reported.
 */
const isCatalog = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string');

/**
 * Compiles imported locale catalogs (`…/src/locales/<tag>.json` modules of
 * id → ICU string) to pre-parsed AST.
 */
const catalogsPlugin = () => ({
  name: 'app-i18n-catalogs',
  enforce: 'pre' as const,
  transform(code: string, id: string): TransformResult {
    if (!isCatalogId(id)) return undefined;
    const catalog: unknown = JSON.parse(code);
    if (!isCatalog(catalog)) return undefined;
    const compiled = Object.fromEntries(
      Object.entries(catalog).map(([messageId, message]) => [
        messageId,
        parse(message),
      ]),
    );
    // Under rolldown a module's type comes from its extension, so without
    // this the built-in JSON plugin still runs afterwards (enforce: 'pre'
    // notwithstanding) and fails parsing the emitted JavaScript as JSON.
    return {
      code: `export default ${JSON.stringify(compiled)};`,
      map: null,
      moduleType: 'js',
    };
  },
});

/**
 * With every message pre-parsed (source defaults via the formatjs transform,
 * catalogs via catalogsPlugin), production bundles swap the ICU parser for
 * FormatJS's no-parser build. Build-only: the dev server and vitest keep the
 * real parser, so string messages still work there and parse errors stay
 * readable. Exact-match alias — the no-parser subpath itself must not loop.
 */
const noParserPlugin = () => ({
  name: 'app-i18n-no-parser',
  apply: 'build' as const,
  config: () => ({
    resolve: {
      alias: [
        {
          find: /^@formatjs\/icu-messageformat-parser$/,
          replacement: '@formatjs/icu-messageformat-parser/no-parser.js',
        },
      ],
    },
  }),
});

export type AppI18nBuildKind = 'app' | 'library';

export type AppI18nOptions = Readonly<{
  /**
   * What is being built. Defaults to `'app'`.
   *
   * `'library'` is for a workspace package that publishes descriptors or
   * catalogs of its own: it compiles them exactly as an app build does, but
   * leaves the ICU parser resolvable. Whether a bundle carries the parser is
   * the consuming application's decision, and a package that aliased it away
   * would take that decision for every host it lands in — including dev
   * servers and test runs, where string messages have to keep working.
   */
  build?: AppI18nBuildKind;
}>;

/**
 * The Vite integration for anything that renders through `@codaco/app-i18n`:
 * compiles `defineMessages` defaultMessage strings to pre-parsed AST at build
 * time (oxc-based `@formatjs/unplugin` — no babel), compiles imported locale
 * catalogs the same way, and — for an app build — drops the ICU parser from
 * production bundles. Place ahead of the framework plugin.
 *
 * A package that ships messages needs this in its own library build too.
 * Publishing them as ICU strings looks harmless, because a message that
 * fails to parse falls back to rendering its source verbatim, and source
 * text with no placeholders is indistinguishable from the formatted result.
 * The first message with a placeholder, or the first real translation, is
 * where a host with no parser starts putting `{count}` on the screen.
 */
export function appI18n(options: AppI18nOptions = {}): PluginOption[] {
  const plugins: PluginOption[] = [
    formatjs({ ast: true }) as PluginOption,
    catalogsPlugin() as PluginOption,
  ];
  if (options.build !== 'library')
    plugins.push(noParserPlugin() as PluginOption);
  return plugins;
}
