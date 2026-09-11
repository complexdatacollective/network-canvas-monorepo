// Reads only the committed catalog artifacts and this package's source as
// TEXT, so it stays runnable while sibling workspace packages are mid-edit —
// the same rule `catalogs.test.ts` and `src/__tests__/packageSource.ts` follow.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceFiles, sourcePath } from '../../__tests__/packageSource.ts';
import fixture from './architectCopy.generators.fixture.json' with { type: 'json' };
import removed from './architectCopy.generators.removed.json' with { type: 'json' };

/**
 * The released Architect's words, for the name generators, the censuses and
 * the bins.
 *
 * Architect 8.2.5 is the oracle for this package's researcher copy (parity
 * plan §3.4), and its strings live in history: `git show
 * 74a07e626:apps/architect/src/locales/{en,es}.json`. Each fixture entry
 * records the Architect id it was taken from in its `from` field, so a
 * disagreement can be settled against that commit rather than against
 * anybody's memory of it.
 *
 * The fixture is the ORACLE, not a snapshot of what the catalogs happen to
 * say: it is written from Architect's catalogs and never regenerated from
 * this package's, so editing a `defaultMessage` away from Architect's wording
 * fails here instead of being absorbed.
 */
const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));

type CatalogEntry = Readonly<{ defaultMessage: string; description: string }>;

const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as Readonly<Record<string, CatalogEntry>>;

const committedEs = JSON.parse(
  readFileSync(join(localesDir, 'es.json'), 'utf8'),
) as Readonly<Record<string, string>>;

const committedEnGb = JSON.parse(
  readFileSync(join(localesDir, 'en-GB.json'), 'utf8'),
) as Readonly<Record<string, string>>;

const fixtureEntries = Object.entries(fixture) as [
  string,
  Readonly<{ en: string; es: string; from: string }>,
][];

const removedIds = Object.keys(removed);

describe('the generator, census and bin copy matches released Architect', () => {
  it('carries every id the fixture names', () => {
    expect(
      fixtureEntries.flatMap(([id]) => (id in committedEn ? [] : [id])),
    ).toEqual([]);
  });

  it.each(fixtureEntries)(
    '%s says what Architect says, in both languages',
    (id, expected) => {
      expect(committedEn[id]?.defaultMessage, `${id} (en)`).toBe(expected.en);
      expect(committedEs[id], `${id} (es)`).toBe(expected.es);
    },
  );

  it('records where every string came from', () => {
    // Provenance is the only thing that makes a disagreement resolvable, so a
    // fixture entry without it is a fixture entry nobody can check.
    expect(
      fixtureEntries.flatMap(([id, entry]) =>
        entry.from.startsWith('74a07e626 architect.') ? [] : [id],
      ),
    ).toEqual([]);
  });
});

describe('the copy this package invented and Architect never showed', () => {
  it('is gone from every catalog', () => {
    const survivors = removedIds.flatMap((id) => [
      ...(id in committedEn ? [`${id} (en)`] : []),
      ...(id in committedEs ? [`${id} (es)`] : []),
      ...(id in committedEnGb ? [`${id} (en-GB)`] : []),
    ]);
    expect(survivors).toEqual([]);
  });

  it('is gone from every defineMessages block', () => {
    // A catalog is regenerated from the source, so an id deleted from
    // `en.json` alone comes straight back on the next extraction. The
    // descriptor itself has to go, which only a scan of the source can say.
    const declarations = sourceFiles().flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return removedIds.flatMap((id) =>
        text.includes(`id: '${id}'`) ? [`${sourcePath(path)} — ${id}`] : [],
      );
    });
    expect(declarations).toEqual([]);
  });
});
