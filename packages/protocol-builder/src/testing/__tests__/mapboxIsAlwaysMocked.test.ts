import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { expectMapboxMocked } from '../mapboxMock.ts';

/**
 * Nothing in this package may reach the real Mapbox SDK.
 *
 * A real `mapbox-gl` map fetches a style, tiles, sprites and fonts from
 * Mapbox's servers. Those are billed requests against a live account, made
 * from a suite and a Storybook that run on every push — the failure mode is a
 * bill, not a red test — and the map needs a WebGL context jsdom does not have
 * anyway.
 *
 * The replacement is a resolver alias in each of the two runners rather than a
 * `vi.mock` in each file that can reach the SDK, because which files those are
 * is not a fact about the map. `stageEditorRegistry.ts` imports every editor
 * family, so anything mounting the package's dispatcher — most of this suite,
 * and every stage editor story — will have the geospatial editor, and
 * therefore the SDK, in its module graph the moment that family lands. A rule
 * each of those files had to remember would be forgotten by exactly the file
 * at risk.
 *
 * So this file checks the two things that make the alias true rather than
 * counting per-file mock declarations: that both runners are configured to
 * swap the module, and — the claim that cannot be faked by reading
 * configuration — that importing the SDK from inside a running test answers
 * with the mock, and records where that test can read it.
 */
const packageRoot = join(process.cwd());
const packageSource = join(packageRoot, 'src');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

const IMPORTS_MAPBOX =
  /(?:from|import|require)\s*\(?\s*['"]mapbox-gl[^'"]*['"]/;

/**
 * The alias both runners spell the same way, as it appears in their source.
 *
 * Matched literally rather than by evaluating the configuration, because the
 * two runners load their configuration in ways a test cannot reproduce — and
 * because a deliberate change to which specifiers are covered should have to
 * be made here too, in both places at once.
 */
const ALIAS_SOURCE = String.raw`/^mapbox-gl(\/esm)?$/`;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });
}

const files = sourceFiles(packageSource);
const contents = new Map(
  files.map((file) => [file, readFileSync(file, 'utf8')]),
);
const shortName = (file: string) => relative(packageSource, file);

describe('the Mapbox SDK in this package', () => {
  /**
   * Only the mock names the SDK here yet: no editor family has landed on this
   * branch, so nothing draws a map. The geospatial family will add its map
   * preview to this list, and that is the point of writing it down — a new
   * importer means the alias has another route to cover, so it is named
   * deliberately rather than discovered by a bill.
   */
  it('is named by the mock that replaces it, and by nothing else yet', () => {
    const importers = files
      .filter((file) => IMPORTS_MAPBOX.test(contents.get(file) ?? ''))
      .map(shortName)
      .toSorted();

    expect(importers).toEqual(['testing/mapboxMock.ts']);
  });

  it.each([
    { runner: 'vitest.config.ts', mock: 'src/testing/mapboxMock.ts' },
    { runner: '.storybook/main.ts', mock: 'mapboxMock.ts' },
  ])('is swapped for a mock by $runner', ({ runner, mock }) => {
    const config = readFileSync(join(packageRoot, runner), 'utf8');

    expect(
      config.includes(ALIAS_SOURCE),
      `${runner} no longer aliases ${ALIAS_SOURCE}, so nothing stops it building a real map.`,
    ).toBe(true);
    expect(
      config.includes(mock),
      `${runner} aliases mapbox-gl somewhere other than ${mock}.`,
    ).toBe(true);

    // Declared AND applied. Both runners name the alias once where they build
    // it and once where they hand it to the resolver, and a config that stopped
    // doing the second would read exactly like one that still did.
    expect(
      config.split('MAPBOX_ALIAS').length - 1,
      `${runner} declares an alias for mapbox-gl but never gives it to the resolver.`,
    ).toBeGreaterThanOrEqual(2);
  });

  /**
   * The claim reading configuration cannot make: that the module a test really
   * gets when it imports the SDK is the mock, and that the map it builds is
   * recorded where the test can read it. Both halves matter — a mock recording
   * into a second copy of itself would leave every "what was built" assertion
   * passing against an array nothing writes to.
   */
  it('answers a live import with the mock, recording where a test can read it', async () => {
    await expectMapboxMocked();
  });
});
