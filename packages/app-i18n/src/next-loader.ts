import { transform } from '@formatjs/unplugin/transform';

import { compileCatalog } from './compileCatalog.ts';

type LoaderContext = Readonly<{
  resourcePath: string;
}>;

/**
 * Turbopack-compatible webpack loader using the same FormatJS source
 * transform and catalog compiler as `appI18n()` for Vite. Configure it before
 * Next's built-in TS/JS handling; retain the extension for source modules and
 * use `as: '*.js'` only on the catalog rule. No React or request state lives
 * here: this module runs only in the build process.
 *
 * The host scopes the JSON rule to its catalog directories. A non-catalog
 * file in that directory stays ordinary data rather than being interpreted
 * as ICU. Default JSON imports therefore retain their existing value.
 */
function appI18nNextLoader(this: LoaderContext, code: string): string {
  if (this.resourcePath.endsWith('.json')) {
    return `export default ${compileCatalog(code, this.resourcePath) ?? code};`;
  }
  return transform(code, this.resourcePath, { ast: true })?.code ?? code;
}

export default appI18nNextLoader;
