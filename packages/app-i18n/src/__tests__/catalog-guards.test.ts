import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkFullLocale,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
  messageTokens,
} from '../catalog-guards.ts';
import type { ExtractedCatalog } from '../catalog-guards.ts';

const source: ExtractedCatalog = {
  'app.plain': { defaultMessage: 'Save', description: 'd' },
  'app.rich': {
    defaultMessage: 'Read <docs>the guide</docs> for {name}',
    description: 'd',
  },
  'app.count': {
    defaultMessage: '{count, plural, one {# item} other {# items}}',
    description: 'd',
  },
};

describe('messageTokens', () => {
  it('collects argument, tag, and plural tokens, including nested ones', () => {
    expect(
      messageTokens('Read <docs>the {kind} guide</docs> for {name}'),
    ).toEqual(['<docs>', '{kind}', '{name}']);
    expect(
      messageTokens('{count, plural, one {# {thing}} other {# things}}'),
    ).toEqual(['{count}', '{thing}']);
  });

  it('throws on invalid ICU', () => {
    expect(() => messageTokens('{unclosed')).toThrow();
  });
});

describe('checkFullLocale', () => {
  it('passes a complete, token-faithful catalog', () => {
    expect(
      checkFullLocale(source, {
        'app.plain': 'Guardar',
        'app.rich': 'Lee <docs>la guía</docs> de {name}',
        'app.count': '{count, plural, one {# elemento} other {# elementos}}',
      }),
    ).toEqual([]);
  });

  it('fails on missing, blank, unknown, token-broken, and invalid entries', () => {
    const issues = checkFullLocale(source, {
      'app.plain': ' ',
      'app.rich': 'Lee la guía de {nombre}',
      'app.extra': 'x',
    });
    expect(issues).toContain('untranslated id: app.count');
    expect(issues).toContain('blank translation: app.plain');
    expect(issues).toContain('token mismatch: app.rich');
    expect(issues).toContain('unknown id: app.extra');
    expect(
      checkFullLocale(source, {
        'app.plain': 'ok',
        'app.rich': '{broken',
        'app.count': '{count, plural, one {#} other {#}}',
      }),
    ).toContain('invalid ICU syntax: app.rich');
  });
});

describe('checkOverrideLocale', () => {
  it('accepts a sparse subset and rejects unknown or token-broken entries', () => {
    expect(checkOverrideLocale(source, { 'app.plain': 'Save' })).toEqual([]);
    expect(checkOverrideLocale(source, { 'app.missing': 'x' })).toEqual([
      'unknown id: app.missing',
    ]);
    expect(checkOverrideLocale(source, { 'app.rich': 'no tokens' })).toEqual([
      'token mismatch: app.rich',
    ]);
  });
});

describe('checkCatalogFreshness', () => {
  it('reports added, changed, and removed ids', () => {
    const committed: ExtractedCatalog = {
      'app.plain': { defaultMessage: 'Save', description: 'd' },
      'app.gone': { defaultMessage: 'x', description: 'd' },
    };
    const extracted: ExtractedCatalog = {
      'app.plain': { defaultMessage: 'Save changes', description: 'd' },
      'app.new': { defaultMessage: 'y', description: 'd' },
    };
    const issues = checkCatalogFreshness(committed, extracted);
    expect(issues).toContain('stale committed entry: app.plain');
    expect(issues).toContain('missing from committed catalog: app.new');
    expect(issues).toContain('committed entry no longer in source: app.gone');
    expect(checkCatalogFreshness(committed, committed)).toEqual([]);
  });
});

describe('extractMessages', () => {
  it('extracts defineMessages calls and enforces ids and descriptions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'app-i18n-extract-'));
    writeFileSync(
      join(dir, 'ok.ts'),
      `import { defineMessages } from 'react-intl';
export const messages = defineMessages({
  save: { id: 'demo.actions.save', defaultMessage: 'Save', description: 'Saves.' },
});
`,
    );
    const catalog = await extractMessages(collectSourceFiles(dir));
    expect(catalog).toEqual({
      'demo.actions.save': { defaultMessage: 'Save', description: 'Saves.' },
    });

    writeFileSync(
      join(dir, 'bad.ts'),
      `import { defineMessages } from 'react-intl';
export const messages = defineMessages({
  bare: { id: 'demo.actions.bare', defaultMessage: 'Bare' },
});
`,
    );
    await expect(extractMessages(collectSourceFiles(dir))).rejects.toThrow(
      /no description/,
    );
  });

  it('excludes tests, stories, and declarations from collection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'app-i18n-collect-'));
    for (const name of [
      'component.tsx',
      'component.stories.tsx',
      'component.test.ts',
      'types.d.ts',
    ]) {
      writeFileSync(join(dir, name), 'export {};\n');
    }
    expect(collectSourceFiles(dir)).toEqual([join(dir, 'component.tsx')]);
  });
});
