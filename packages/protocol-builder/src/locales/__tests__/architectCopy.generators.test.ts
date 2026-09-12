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
    // Without this the sweep below passes on an emptied fixture: every
    // `flatMap` would answer `[]` and `it.each([])` would register no cases
    // at all, so the oracle would report green having checked nothing.
    expect(fixtureEntries.length).toBeGreaterThan(0);
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
  it('names the copy it is judging', () => {
    // An emptied manifest would make both sweeps below vacuous, and a string
    // this package invented could then come back with nothing to catch it.
    expect(removedIds.length).toBeGreaterThan(0);
  });

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
    const files = sourceFiles();
    // Without this the sweep passes on an empty file list.
    expect(files.length).toBeGreaterThan(0);
    const declarations = files.flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      return removedIds.flatMap((id) =>
        text.includes(`id: '${id}'`) ? [`${sourcePath(path)} — ${id}`] : [],
      );
    });
    expect(declarations).toEqual([]);
  });
});

/**
 * The sentences kept because Architect renders no element they could be
 * matched against, and the controls each one sends the researcher to.
 *
 * Nothing above pins these — they are this package's own words — so what has
 * to hold is that each still names a control by the name it is wearing. This
 * family re-pointed about thirty labels at Architect's wording, and a
 * sentence left behind tells a researcher to go and use a box that is not on
 * the screen under that name.
 */
const SENTENCES_THAT_NAME_A_CONTROL = [
  {
    sentence: 'protocolBuilder.alterLimits.noEndAnswered',
    names: [
      'protocolBuilder.alterLimits.minLabel',
      'protocolBuilder.alterLimits.maxLabel',
    ],
  },
  {
    sentence: 'protocolBuilder.cardDisplay.clearTitle',
    names: ['protocolBuilder.cardDisplay.title'],
  },
  {
    sentence: 'protocolBuilder.cardDisplay.clearConfirm',
    names: ['protocolBuilder.cardDisplay.title'],
  },
] as const;

// Lower-cased on both sides: a label is capitalised as a heading and these
// sentences quote it mid-sentence, in English and in Spanish alike.
const englishWords = (id: string): string => {
  const entry = committedEn[id];
  if (entry === undefined) throw new Error(`${id} is in no English catalog`);
  return entry.defaultMessage.toLowerCase();
};

const spanishWords = (id: string): string => {
  const entry = committedEs[id];
  if (entry === undefined) throw new Error(`${id} is in no Spanish catalog`);
  return entry.toLowerCase();
};

describe('the copy Architect has no element for still names what is on screen', () => {
  it.each(SENTENCES_THAT_NAME_A_CONTROL)(
    '$sentence names the controls it sends the researcher to',
    ({ sentence, names }) => {
      for (const label of names) {
        expect(
          englishWords(sentence),
          `${sentence} (en) does not name ${label}`,
        ).toContain(englishWords(label));
        expect(
          spanishWords(sentence),
          `${sentence} (es) does not name ${label}`,
        ).toContain(spanishWords(label));
      }
    },
  );
});
