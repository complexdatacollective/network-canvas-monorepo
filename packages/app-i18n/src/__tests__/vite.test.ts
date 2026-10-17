import { tmpdir } from 'node:os';

import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

import { appI18n } from '../vite.ts';

/**
 * Which module ids the catalog compiler claims.
 *
 * Getting this wrong fails silently and expensively: an id that does not match
 * is simply not compiled and the catalog stays a map of ICU strings that the
 * app parses at run time. Nothing errors — the app just does the work on the
 * client — so the only thing standing between that and a release is this
 * matching.
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

describe('the ICU parser', () => {
  it('is left resolvable in a production build', async () => {
    // Protocol strings are ICU messages that protocol-validation and the
    // interview runtime parse at run time, so no plugin may swap the parser
    // for FormatJS's no-parser build. Resolving the config runs every
    // plugin's `config` hook, which is where such an alias is installed.
    const config = await resolveConfig(
      { configFile: false, root: tmpdir(), plugins: appI18n() },
      'build',
      'production',
    );
    expect(config.plugins.map((plugin) => plugin.name)).toContain(
      'app-i18n-catalogs',
    );
    expect(
      config.resolve.alias.filter(({ replacement }) =>
        replacement.includes('icu-messageformat-parser'),
      ),
    ).toEqual([]);
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

  it('leaves the translation-provenance sidecars alone', () => {
    // These sit beside the catalogs and hold the English each translation was
    // made from. Compiling one would parse English prose as ICU; bundling one
    // would ship every English sentence a second time, in every locale. A
    // locale tag cannot contain a dot, which is what keeps them out.
    const sources = JSON.stringify({ 'app.plain': 'Save' });
    expect(catalogTransform()(sources, '/app/src/locales/es.source.json')).toBe(
      undefined,
    );
    expect(
      catalogTransform()(sources, '/app/src/locales/en-GB.source.json'),
    ).toBe(undefined);
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
