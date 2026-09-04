import { parse } from '@formatjs/icu-messageformat-parser';
import formatjs from '@formatjs/unplugin/vite';
import type { PluginOption } from 'vite';

const CATALOG_PATTERN = /\/locales\/[A-Za-z0-9-]+\.json$/;

type TransformResult =
  | { code: string; map: null; moduleType: 'js' }
  | undefined;

/**
 * Compiles imported locale catalogs (`…/locales/<tag>.json` modules of
 * id → ICU string) to pre-parsed AST. `en.json` is excluded: it is the
 * extraction artifact read by the catalog guards, never imported at runtime.
 *
 * Ids are matched on a separator-normalised copy, the way this repo's other
 * id-matching Vite plugins do (`packages/interview/vite.config.ts`). A
 * Windows id can carry `\` separators, and the silent failure — no match, so
 * no compilation — would not surface until someone noticed the ICU parser
 * back in a production bundle.
 */
const catalogsPlugin = () => ({
  name: 'app-i18n-catalogs',
  enforce: 'pre' as const,
  transform(code: string, id: string): TransformResult {
    const path = id.replace(/\\/g, '/');
    if (!CATALOG_PATTERN.test(path) || path.endsWith('/en.json')) {
      return undefined;
    }
    const catalog = JSON.parse(code) as Record<string, string>;
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

/**
 * The complete Vite integration for an app that renders through
 * `@codaco/app-i18n`: compiles `defineMessages` defaultMessage strings to
 * pre-parsed AST at build time (oxc-based `@formatjs/unplugin` — no babel),
 * compiles imported locale catalogs the same way, and drops the ICU parser
 * from production bundles. Place ahead of the framework plugin.
 */
export function appI18n(): PluginOption[] {
  return [
    formatjs({ ast: true }) as PluginOption,
    catalogsPlugin() as PluginOption,
    noParserPlugin() as PluginOption,
  ];
}
