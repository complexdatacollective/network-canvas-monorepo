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
});
