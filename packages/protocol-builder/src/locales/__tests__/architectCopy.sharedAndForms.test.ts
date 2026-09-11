// Reads only the committed catalogs and the package source as TEXT, so it
// stays runnable while sibling workspace packages are mid-edit — the same rule
// catalogs.test.ts follows.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sourceFiles, sourcePath } from '../../__tests__/packageSource';
import fixture from './architectCopy.sharedAndForms.fixture.json';
import removed from './architectCopy.sharedAndForms.removed.json';

/**
 * The released Architect is the oracle for this package's copy (parity spec
 * §3.4). `@codaco/architect@8.2.5` carries its strings inline; `74a07e626` is
 * the byte-identical extraction of them, with Spanish, and is therefore what
 * every entry in the fixture is quoted from — the `from` field on each entry
 * names the Architect id it came from, or says whose judgement wrote it.
 *
 * The fixture is the assertion, not a snapshot: editing a string here without
 * editing Architect's oracle is exactly the drift this test exists to refuse.
 */
const localesDir = dirname(dirname(fileURLToPath(import.meta.url)));

type FixtureEntry = { en: string; es: string; from: string };

const committedEn = JSON.parse(
  readFileSync(join(localesDir, 'en.json'), 'utf8'),
) as Record<string, { defaultMessage: string }>;

const committedEs = JSON.parse(
  readFileSync(join(localesDir, 'es.json'), 'utf8'),
) as Record<string, string>;

const committedEnGb = JSON.parse(
  readFileSync(join(localesDir, 'en-GB.json'), 'utf8'),
) as Record<string, string>;

const entries = Object.entries(fixture as Record<string, FixtureEntry>);

describe('the shared sections and the form family say what Architect says', () => {
  it('has an oracle for every entry', () => {
    // Guards the fixture itself: an entry with no provenance is a string
    // somebody wrote, not one Architect says, and the rest of this file would
    // then be pinning the package to itself.
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      expect(entry.from, `${id} has no derivation`).toMatch(
        /^(74a07e626 architect\.|josh 2026-09-11|judgement|exception \d)/,
      );
    }
  });

  it.each(entries)(
    '%s reads as Architect writes it, in English',
    (id, entry) => {
      expect(committedEn[id]?.defaultMessage).toBe(entry.en);
    },
  );

  it.each(entries)(
    '%s reads as Architect writes it, in Spanish',
    (id, entry) => {
      expect(committedEs[id]).toBe(entry.es);
    },
  );
});

describe('the copy Architect never showed', () => {
  const sources = sourceFiles().map((path) => ({
    path: sourcePath(path),
    text: readFileSync(path, 'utf8'),
  }));

  it('reads the source it judges', () => {
    // Without this the source sweep below passes on an empty file list.
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(removed as string[])('%s is in no catalog', (id) => {
    expect(Object.keys(committedEn)).not.toContain(id);
    expect(Object.keys(committedEs)).not.toContain(id);
    expect(Object.keys(committedEnGb)).not.toContain(id);
  });

  it.each(removed as string[])('%s is declared nowhere in the source', (id) => {
    expect(
      sources.filter((file) => file.text.includes(id)).map((file) => file.path),
    ).toEqual([]);
  });
});
