// Reads only the committed catalog artifacts and this package's source as
// TEXT, so it stays runnable while sibling workspace packages are mid-edit —
// the rule `catalogs.test.ts` and `exportsMap.test.ts` already follow.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceFiles, sourcePath } from '../../__tests__/packageSource.ts';

/**
 * The canvas, pedigree and anonymisation editors say what the released
 * Architect said.
 *
 * The oracle is Architect 8.2.5's own catalogs, read out of history at
 * `74a07e626` (the last commit where Architect's editors and this package's
 * coexist) and recorded per id in the fixture beside this file, together with
 * the Architect id each string came from. A researcher moving between the two
 * reads one vocabulary, so a string edited on one side alone fails here rather
 * than drifting quietly.
 *
 * The fixture is the whole assertion: it holds the exact `en` and `es` a
 * catalog has to carry, so changing any one of the strings — in either
 * language — fails this test and has to be argued.
 */

const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));
const testDir = dirname(fileURLToPath(import.meta.url));

type FixtureEntry = { en: string; es: string; from: string };

const fixture = JSON.parse(
  readFileSync(join(testDir, 'architectCopy.canvas.fixture.json'), 'utf8'),
) as Record<string, FixtureEntry>;

const removed = JSON.parse(
  readFileSync(join(testDir, 'architectCopy.canvas.removed.json'), 'utf8'),
) as string[];

const en = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as Record<string, { defaultMessage: string }>;

const es = JSON.parse(
  readFileSync(join(localesDir, 'es.json'), 'utf8'),
) as Record<string, string>;

describe('canvas, pedigree and anonymisation copy against released Architect', () => {
  it('has a fixture to check', () => {
    // Guards the read and the path: an empty fixture would make every
    // assertion below vacuous.
    expect(Object.keys(fixture).length).toBeGreaterThan(150);
    expect(removed.length).toBeGreaterThan(10);
  });

  it('records where every fixture string came from', () => {
    const undocumented = Object.entries(fixture).flatMap(([id, entry]) =>
      entry.from.trim() === '' ? [id] : [],
    );

    expect(undocumented).toEqual([]);
  });

  it('carries Architect’s English for every id', () => {
    const offenders = Object.entries(fixture).flatMap(([id, entry]) => {
      const committed = en[id]?.defaultMessage;
      if (committed === undefined) return [`${id} — absent from en.json`];
      return committed === entry.en
        ? []
        : [`${id}\n  is: ${committed}\n  want: ${entry.en}`];
    });

    expect(offenders).toEqual([]);
  });

  it('carries Architect’s Spanish for every id', () => {
    const offenders = Object.entries(fixture).flatMap(([id, entry]) => {
      const committed = es[id];
      if (committed === undefined) return [`${id} — absent from es.json`];
      return committed === entry.es
        ? []
        : [`${id}\n  is: ${committed}\n  want: ${entry.es}`];
    });

    expect(offenders).toEqual([]);
  });

  it('no longer declares the strings Architect never rendered', () => {
    // Both catalogs AND the source: a descriptor left behind in a
    // `defineMessages` block is copy this package still says, whether or not
    // the extraction has caught up with it.
    const declarations = sourceFiles().flatMap((file) => {
      const contents = readFileSync(file, 'utf8');
      return removed.flatMap((id) =>
        contents.includes(`'${id}'`) || contents.includes(`"${id}"`)
          ? [`${sourcePath(file)} still declares ${id}`]
          : [],
      );
    });

    const catalogued = removed.flatMap((id) => [
      ...(id in en ? [`en.json still carries ${id}`] : []),
      ...(id in es ? [`es.json still carries ${id}`] : []),
    ]);

    expect([...declarations, ...catalogued]).toEqual([]);
  });
});
