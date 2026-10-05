import formatjs from '@formatjs/unplugin/vite';
import type { PluginOption } from 'vite';

import { compileCatalog } from './compileCatalog.ts';

type TransformResult =
  | { code: string; map: null; moduleType: 'js' }
  | undefined;

/**
 * Compiles imported locale catalogs (`…/src/locales/<tag>.json` modules of
 * id → ICU string) to pre-parsed AST.
 */
const catalogsPlugin = () => ({
  name: 'app-i18n-catalogs',
  enforce: 'pre' as const,
  transform(code: string, id: string): TransformResult {
    const compiled = compileCatalog(code, id);
    if (compiled === undefined) return undefined;
    // Under rolldown a module's type comes from its extension, so without
    // this the built-in JSON plugin still runs afterwards (enforce: 'pre'
    // notwithstanding) and fails parsing the emitted JavaScript as JSON.
    return {
      code: `export default ${compiled};`,
      map: null,
      moduleType: 'js',
    };
  },
});

/**
 * The Vite integration for anything that renders through `@codaco/app-i18n`:
 * compiles `defineMessages` defaultMessage strings to pre-parsed AST at build
 * time (oxc-based `@formatjs/unplugin` — no babel) and compiles imported
 * locale catalogs the same way, so the app's own messages need no parsing at
 * run time. Place ahead of the framework plugin.
 *
 * The ICU parser itself stays in every bundle: protocol strings are ICU
 * messages that `@codaco/protocol-validation` and the interview runtime parse
 * at run time.
 *
 * A package that ships messages needs this in its own library build too, so
 * its descriptors and catalogs reach consumers already compiled.
 */
export function appI18n(): PluginOption[] {
  return [
    formatjs({ ast: true }) as PluginOption,
    catalogsPlugin() as PluginOption,
  ];
}
