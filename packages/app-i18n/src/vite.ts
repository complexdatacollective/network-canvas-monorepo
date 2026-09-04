import { parse } from '@formatjs/icu-messageformat-parser';
import babelPluginFormatjs from 'babel-plugin-formatjs';

/**
 * Babel entry for `@vitejs/plugin-react`'s `babel.plugins`: compiles every
 * `defineMessages` defaultMessage to pre-parsed AST so production bundles
 * carry no ICU parser. Descriptions are extraction-time data and are
 * removed from bundles.
 */
export function appI18nBabel(): [unknown, Record<string, unknown>] {
  return [babelPluginFormatjs, { ast: true, removeDefaultMessage: false }];
}

const CATALOG_PATTERN = /\/locales\/[A-Za-z0-9-]+\.json$/;

type TransformResult = { code: string; map: null } | undefined;

/**
 * Vite plugin that compiles imported locale catalogs (`…/locales/<tag>.json`
 * modules of id → ICU string) to pre-parsed AST. Runs before Vite's own JSON
 * plugin. `en.json` is excluded: it is the extraction artifact read by the
 * catalog guards, never imported at runtime.
 */
export function appI18nCatalogs(): {
  name: string;
  enforce: 'pre';
  transform: (code: string, id: string) => TransformResult;
} {
  return {
    name: 'app-i18n-catalogs',
    enforce: 'pre',
    transform(code: string, id: string): TransformResult {
      if (!CATALOG_PATTERN.test(id) || id.endsWith('/en.json')) {
        return undefined;
      }
      const catalog = JSON.parse(code) as Record<string, string>;
      const compiled = Object.fromEntries(
        Object.entries(catalog).map(([messageId, message]) => [
          messageId,
          parse(message),
        ]),
      );
      return {
        code: `export default ${JSON.stringify(compiled)};`,
        map: null,
      };
    },
  };
}
