import { describe, expect, it } from 'vitest';

import { appI18n } from '../vite.ts';

/**
 * Which module ids the catalog compiler claims.
 *
 * Getting this wrong fails silently and expensively: an id that does not match
 * is simply not compiled, the catalog stays a map of ICU strings, and the
 * runtime parser it was supposed to make unnecessary comes back into the
 * production bundle. Nothing errors — the app just carries a parser and does
 * the work at runtime — so the only thing standing between that and a release
 * is this matching.
 */

type TransformFn = (
  code: string,
  id: string,
) => { code: string; moduleType: string } | undefined;

function catalogTransform(): TransformFn {
  const plugin = appI18n().find(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'name' in entry &&
      entry.name === 'app-i18n-catalogs',
  );
  if (
    typeof plugin !== 'object' ||
    plugin === null ||
    !('transform' in plugin) ||
    typeof plugin.transform !== 'function'
  ) {
    throw new Error('app-i18n-catalogs plugin has no transform hook');
  }
  return plugin.transform as unknown as TransformFn;
}

const CATALOG = JSON.stringify({ 'demo.hello': 'Hello {name}' });

const pluginNames = (plugins: ReturnType<typeof appI18n>): string[] =>
  plugins.flatMap((entry) =>
    typeof entry === 'object' && entry !== null && 'name' in entry
      ? [entry.name]
      : [],
  );

describe('the build kind', () => {
  it('drops the ICU parser from an app bundle', () => {
    expect(pluginNames(appI18n())).toContain('app-i18n-no-parser');
  });

  it('compiles a library’s messages but leaves it the parser', () => {
    // A package cannot know whether its consumer's bundle keeps the parser,
    // so it compiles its own messages and takes no view on the alias.
    const names = pluginNames(appI18n({ build: 'library' }));
    expect(names).toContain('app-i18n-catalogs');
    expect(names).not.toContain('app-i18n-no-parser');
  });
});

describe('the catalog transform', () => {
  it('compiles a catalog to AST', () => {
    const result = catalogTransform()(CATALOG, '/app/src/locales/en-GB.json');
    expect(result?.moduleType).toBe('js');
    // Compiled, not passed through: an AST is an array of parts, and the
    // placeholder survives as a structured argument rather than as `{name}`.
    expect(result?.code).toContain('"type"');
    expect(result?.code).toContain('"name"');
    expect(result?.code).not.toContain('Hello {name}');
  });

  it('matches ids that use Windows separators', () => {
    // Vite ids normally carry POSIX separators, but not on every host and not
    // through every hook — which is why this repo's other id-matching plugins
    // normalise before testing. A missed match here is invisible until the
    // parser turns up in a bundle.
    const result = catalogTransform()(
      CATALOG,
      'C:\\app\\src\\locales\\en-GB.json',
    );
    expect(result?.moduleType).toBe('js');
  });

  it('leaves en.json alone, whichever separators the id uses', () => {
    // `en.json` is the extraction artifact the catalog guards read; English
    // renders from inline defaults and never imports it.
    expect(catalogTransform()(CATALOG, '/app/src/locales/en.json')).toBe(
      undefined,
    );
    expect(catalogTransform()(CATALOG, 'C:\\app\\src\\locales\\en.json')).toBe(
      undefined,
    );
  });

  it('ignores JSON that is not a catalog', () => {
    expect(catalogTransform()('{}', '/app/package.json')).toBe(undefined);
    expect(catalogTransform()('{}', 'C:\\app\\src\\data\\fixtures.json')).toBe(
      undefined,
    );
  });

  it('leaves a dependency’s own locale files alone', () => {
    // Rewriting a library's catalog to AST hands it a shape its own runtime
    // does not understand, and nothing about the id says it was ours.
    expect(
      catalogTransform()(
        CATALOG,
        '/app/node_modules/other-lib/src/locales/fr.json',
      ),
    ).toBe(undefined);
  });

  it('claims only catalogs under a src/locales directory', () => {
    expect(catalogTransform()(CATALOG, '/app/config/locales/fr.json')).toBe(
      undefined,
    );
  });

  it('ignores a file under src/locales whose name is not a locale tag', () => {
    const countries = JSON.stringify({ FR: 'France', GB: 'United Kingdom' });
    expect(
      catalogTransform()(countries, '/app/src/locales/countries.json'),
    ).toBe(undefined);
  });

  it('ignores JSON under src/locales that is not a flat map of strings', () => {
    // A nested catalog belongs to some other i18n runtime. Parsing its values
    // as ICU fails the build outright, which is a worse answer than declining
    // a file this plugin has no claim on.
    const nested = JSON.stringify({ form: { submit: 'Envoyer' } });
    expect(catalogTransform()(nested, '/app/src/locales/fr.json')).toBe(
      undefined,
    );
  });
});
