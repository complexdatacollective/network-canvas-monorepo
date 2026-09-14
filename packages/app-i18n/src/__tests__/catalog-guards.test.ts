import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkCatalogFreshness,
  checkFullLocale,
  checkOverrideLocale,
  collectSourceFiles,
  extractMessages,
  formatStampReport,
  messageTokens,
  readTranslationSources,
  stampTranslationSources,
} from '../catalog-guards.ts';
import type {
  ExtractedCatalog,
  TranslationSources,
} from '../catalog-guards.ts';

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
  'app.price': {
    defaultMessage: 'Costs {price, number, ::currency/GBP}',
    description: 'd',
  },
};

/** Provenance for a catalog translated from exactly today's English. */
const sources: TranslationSources = Object.fromEntries(
  Object.entries(source).map(([id, entry]) => [id, entry.defaultMessage]),
);

/**
 * The provenance a sparse override carries: a record for each id it overrides
 * and nothing more, so the override checks below assert token parity without
 * also tripping the unused-record check.
 */
const pick = (ids: readonly string[]): TranslationSources =>
  Object.fromEntries(ids.map((id) => [id, sources[id] ?? '']));

describe('messageTokens', () => {
  it('collects argument, tag, and plural tokens, including nested ones', () => {
    expect(
      messageTokens('Read <docs>the {kind} guide</docs> for {name}'),
    ).toEqual(['<docs>', '{kind}', '{name}']);
    expect(
      messageTokens('{count, plural, one {# {thing}} other {# things}}'),
    ).toEqual(['{count, plural, offset:0}', '{thing}']);
  });

  it('distinguishes how an argument is formatted, not only its name', () => {
    // Each pair renders differently, so a translation swapping one for the
    // other has lost locale-aware formatting while still looking translated.
    expect(messageTokens('{price}')).not.toEqual(
      messageTokens('{price, number}'),
    );
    expect(messageTokens('{price, number}')).not.toEqual(
      messageTokens('{price, number, ::currency/GBP}'),
    );
    expect(messageTokens('{when, date, short}')).not.toEqual(
      messageTokens('{when, date, full}'),
    );
    expect(messageTokens('{when, date}')).not.toEqual(
      messageTokens('{when, time}'),
    );
    expect(messageTokens('{n, plural, other {#}}')).not.toEqual(
      messageTokens('{n, selectordinal, other {#}}'),
    );
    expect(messageTokens('{n, plural, other {#}}')).not.toEqual(
      messageTokens('{n, plural, offset:1 other {#}}'),
    );
    expect(messageTokens('{kind, select, other {x}}')).not.toEqual(
      messageTokens('{kind, plural, other {x}}'),
    );
  });

  it('pins the arms whose loss would be silent, and frees the rest', () => {
    // Both of these fall through to `other` at runtime rather than failing:
    // `{g, select, other {they}}` renders "they" for g="male", and a plural
    // without `=0` renders "0 items" for n=0.
    expect(messageTokens('{g, select, male {he} other {they}}')).not.toEqual(
      messageTokens('{g, select, other {they}}'),
    );
    expect(messageTokens('{n, plural, =0 {none} other {#}}')).not.toEqual(
      messageTokens('{n, plural, other {#}}'),
    );

    // Plural categories belong to the target language, so differing there is
    // a correct translation, not a divergence.
    expect(messageTokens('{n, plural, one {# item} other {# items}}')).toEqual(
      messageTokens('{n, plural, few {#} many {#} other {#}}'),
    );
  });

  it('reads a skeleton by its options, not the order they were written in', () => {
    expect(messageTokens('{price, number, ::currency/GBP group-off}')).toEqual(
      messageTokens('{price, number, ::group-off currency/GBP}'),
    );
  });

  it('throws on invalid ICU', () => {
    expect(() => messageTokens('{unclosed')).toThrow();
  });
});

describe('checkFullLocale', () => {
  it('passes a complete, token-faithful catalog', () => {
    expect(
      checkFullLocale(
        source,
        {
          'app.plain': 'Guardar',
          'app.rich': 'Lee <docs>la guía</docs> de {name}',
          // Spanish needs no `one` arm of its own here, and adding `many` would
          // be equally fine: arm structure belongs to the target language.
          'app.count': '{count, plural, other {# elementos}}',
          'app.price': 'Cuesta {price, number, ::currency/GBP}',
        },
        sources,
      ),
    ).toEqual([]);
  });

  it('fails on missing, blank, unknown, token-broken, and invalid entries', () => {
    const issues = checkFullLocale(
      source,
      {
        'app.plain': ' ',
        'app.rich': 'Lee la guía de {nombre}',
        'app.extra': 'x',
      },
      sources,
    );
    expect(issues).toContain('untranslated id: app.count');
    expect(issues).toContain('blank translation: app.plain');
    expect(issues).toContain('token mismatch: app.rich');
    expect(issues).toContain('unknown id: app.extra');
    expect(
      checkFullLocale(
        source,
        {
          'app.plain': 'ok',
          'app.rich': '{broken',
          'app.count': '{count, plural, one {#} other {#}}',
          'app.price': 'x {price, number, ::currency/GBP}',
        },
        sources,
      ),
    ).toContain('invalid ICU syntax: app.rich');
  });

  it('fails a translation that keeps the argument but drops its formatting', () => {
    expect(
      checkFullLocale(
        source,
        {
          'app.plain': 'Guardar',
          'app.rich': 'Lee <docs>la guía</docs> de {name}',
          'app.count': '{count, plural, other {# elementos}}',
          'app.price': 'Cuesta {price}',
        },
        sources,
      ),
    ).toEqual(['token mismatch: app.price']);
  });
});

describe('checkOverrideLocale', () => {
  it('accepts a sparse subset and rejects unknown or token-broken entries', () => {
    expect(
      checkOverrideLocale(source, { 'app.plain': 'Save' }, pick(['app.plain'])),
    ).toEqual([]);
    expect(
      checkOverrideLocale(
        source,
        { 'app.missing': 'x' },
        pick(['app.missing']),
      ),
    ).toEqual(['unknown id: app.missing']);
    expect(
      checkOverrideLocale(
        source,
        { 'app.rich': 'no tokens' },
        pick(['app.rich']),
      ),
    ).toEqual(['token mismatch: app.rich']);
    expect(
      checkOverrideLocale(
        source,
        { 'app.price': 'Costs {price}' },
        pick(['app.price']),
      ),
    ).toEqual(['token mismatch: app.price']);
  });

  it('rejects a translation that drops a select arm', () => {
    const withSelect: ExtractedCatalog = {
      'app.gender': {
        defaultMessage:
          '{g, select, male {He} female {She} other {They}} replied',
        description: 'd',
      },
    };
    expect(
      checkOverrideLocale(
        withSelect,
        { 'app.gender': '{g, select, other {They}} answered' },
        { 'app.gender': withSelect['app.gender']?.defaultMessage ?? '' },
      ),
    ).toEqual(['token mismatch: app.gender']);
  });
});

describe('translation provenance', () => {
  const complete = {
    'app.plain': 'Guardar',
    'app.rich': 'Lee <docs>la guía</docs> de {name}',
    'app.count': '{count, plural, other {# elementos}}',
    'app.price': 'Cuesta {price, number, ::currency/GBP}',
  };

  it('fails a translation whose English has since been reworded', () => {
    // The regression this guard exists for: the English sentence changed
    // meaning, the Spanish still says the old thing, and every other check
    // here passes — the catalog is complete, the tokens match, nothing is
    // blank. Only the recorded source knows.
    const issues = checkFullLocale(source, complete, {
      ...sources,
      'app.plain': 'Download',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('translated from older English: app.plain');
    // Both sentences and the translation, so the reader can tell a reworded
    // meaning from a capitalisation fix without opening another file.
    expect(issues[0]).toContain('"Download"');
    expect(issues[0]).toContain('"Save"');
    expect(issues[0]).toContain('"Guardar"');
  });

  it('fails a translation carrying no record of what it was made from', () => {
    const { 'app.price': _dropped, ...incomplete } = sources;
    expect(checkFullLocale(source, complete, incomplete)).toEqual([
      'no recorded English source: app.price',
    ]);
  });

  it('fails a record stamped ahead of the translation it vouches for', () => {
    // Otherwise a sidecar could be stamped for an id nobody has translated,
    // and the record would go green the moment a translation appeared —
    // whatever it said.
    expect(
      checkOverrideLocale(source, { 'app.plain': 'Save' }, sources),
    ).toEqual([
      'recorded English source for an untranslated id: app.rich',
      'recorded English source for an untranslated id: app.count',
      'recorded English source for an untranslated id: app.price',
    ]);
  });

  it('holds an override locale to the same record as a full one', () => {
    // An override drifts more quietly than a full translation: it exists
    // because its wording differs from the base, so nothing about it looking
    // different from English is evidence that it is current.
    expect(
      checkOverrideLocale(
        source,
        { 'app.plain': 'Save changes' },
        { 'app.plain': 'Store' },
      ),
    ).toEqual([
      `translated from older English: app.plain — was "Store", now "Save", translation says "Save changes"`,
    ]);
  });

  it('accepts exactly what the stamping tool writes, and reports what moved', () => {
    const dir = mkdtempSync(join(tmpdir(), 'app-i18n-stamp-'));
    writeFileSync(
      join(dir, 'en.json'),
      JSON.stringify({
        'app.plain': { defaultMessage: 'Save', description: 'd' },
      }),
    );
    writeFileSync(join(dir, 'es.json'), JSON.stringify({ 'app.plain': 'Ya' }));
    // Never a catalog, so it is neither stamped nor read as one; the same
    // rule keeps the sidecars out of every bundle.
    writeFileSync(join(dir, 'es.source.json'), JSON.stringify({}));

    const first = stampTranslationSources(dir);
    expect(first.map(({ locale }) => locale)).toEqual(['es']);
    expect(first[0]?.recorded).toEqual([
      {
        id: 'app.plain',
        previous: undefined,
        current: 'Save',
        translation: 'Ya',
      },
    ]);
    expect(readTranslationSources(dir, 'es')).toEqual({ 'app.plain': 'Save' });

    const committed = JSON.parse(
      readFileSync(join(dir, 'en.json'), 'utf8'),
    ) as ExtractedCatalog;
    expect(
      checkFullLocale(
        committed,
        { 'app.plain': 'Ya' },
        readTranslationSources(dir, 'es'),
      ),
    ).toEqual([]);

    // Reword the English: the guard fails, and re-stamping reports the pair a
    // reviewer needs to judge whether re-translating was skipped.
    writeFileSync(
      join(dir, 'en.json'),
      JSON.stringify({
        'app.plain': { defaultMessage: 'Save changes', description: 'd' },
      }),
    );
    expect(
      checkFullLocale(
        { 'app.plain': { defaultMessage: 'Save changes', description: 'd' } },
        { 'app.plain': 'Ya' },
        readTranslationSources(dir, 'es'),
      ),
    ).toHaveLength(1);

    const second = stampTranslationSources(dir);
    expect(second[0]?.recorded).toEqual([
      {
        id: 'app.plain',
        previous: 'Save',
        current: 'Save changes',
        translation: 'Ya',
      },
    ]);
    expect(formatStampReport(second)).toContain('English was : "Save"');
    expect(formatStampReport(second)).toContain('English now : "Save changes"');
  });

  it('leaves a translation whose English was deleted unstamped', () => {
    // Stamping must not paper over a translation for an id that no longer
    // exists; it stays reportable as an unknown id.
    const dir = mkdtempSync(join(tmpdir(), 'app-i18n-stamp-'));
    writeFileSync(join(dir, 'en.json'), JSON.stringify({}));
    writeFileSync(join(dir, 'es.json'), JSON.stringify({ 'app.gone': 'Ya' }));

    expect(stampTranslationSources(dir)[0]?.recorded).toEqual([]);
    expect(
      checkFullLocale(
        {},
        { 'app.gone': 'Ya' },
        readTranslationSources(dir, 'es'),
      ),
    ).toEqual(['unknown id: app.gone']);
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

  it('rejects an id declared in two files, even with identical text', async () => {
    // The extractor coalesces this pair silently — only a conflicting one
    // throws — so two call sites would share a translation identity until
    // somebody changed one of them.
    const dir = mkdtempSync(join(tmpdir(), 'app-i18n-dup-'));
    const declaration = `import { defineMessages } from 'react-intl';
export const messages = defineMessages({
  save: { id: 'demo.actions.save', defaultMessage: 'Save', description: 'Saves.' },
});
`;
    writeFileSync(join(dir, 'one.ts'), declaration);
    writeFileSync(join(dir, 'two.ts'), declaration);
    await expect(extractMessages(collectSourceFiles(dir))).rejects.toThrow(
      /"demo\.actions\.save" is declared in both .*one\.ts and .*two\.ts/,
    );
  });

  it('rejects an id declared twice in one file, whatever the second says', async () => {
    // Neither shape survives extraction: an identical pair merges without a
    // word, and a conflicting pair is not an error either — the extractor
    // logs a warning nothing reads and lets the later one win, so a call site
    // silently renders copy written for somewhere else.
    for (const [name, second] of [
      ['identical', `'Save', description: 'Saves.'`],
      ['conflicting', `'Store', description: 'Stores.'`],
    ] as const) {
      const dir = mkdtempSync(join(tmpdir(), `app-i18n-dup-${name}-`));
      writeFileSync(
        join(dir, 'both.ts'),
        `import { defineMessages } from 'react-intl';
export const first = defineMessages({
  save: { id: 'demo.actions.save', defaultMessage: 'Save', description: 'Saves.' },
});
export const second = defineMessages({
  store: { id: 'demo.actions.save', defaultMessage: ${second} },
});
`,
      );
      await expect(extractMessages(collectSourceFiles(dir))).rejects.toThrow(
        /"demo\.actions\.save" is declared twice in .*both\.ts/,
      );
    }
  });

  it('rejects copy that is only whitespace', async () => {
    // A lone space is not a message and not a description, but it is not the
    // empty string either — so an exact-equality check let it through, and
    // both the generated catalog and the freshness guard stayed green with a
    // blank string on its way to a reader.
    for (const [name, descriptor] of [
      [
        'message',
        `id: 'demo.blank', defaultMessage: ' ', description: 'Real.'`,
      ],
      [
        'description',
        `id: 'demo.blank', defaultMessage: 'Real', description: '  '`,
      ],
    ] as const) {
      const dir = mkdtempSync(join(tmpdir(), `app-i18n-blank-${name}-`));
      writeFileSync(
        join(dir, 'blank.ts'),
        `import { defineMessages } from 'react-intl';
export const messages = defineMessages({ blank: { ${descriptor} } });
`,
      );
      await expect(extractMessages(collectSourceFiles(dir))).rejects.toThrow(
        /has no (defaultMessage|description for translators)/,
      );
    }
  });

  it('rejects FormatJS’s structured description form', async () => {
    // The extractor writes the object straight through, and en.json would then
    // fail its own freshness check on every run: two parses of the same object
    // are never the same reference.
    const dir = mkdtempSync(join(tmpdir(), 'app-i18n-objdesc-'));
    writeFileSync(
      join(dir, 'structured.ts'),
      `import { defineMessages } from 'react-intl';
export const messages = defineMessages({
  save: {
    id: 'demo.actions.save',
    defaultMessage: 'Save',
    description: { text: 'Saves.', context: 'toolbar' },
  },
});
`,
    );
    await expect(extractMessages(collectSourceFiles(dir))).rejects.toThrow(
      /non-string description/,
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
