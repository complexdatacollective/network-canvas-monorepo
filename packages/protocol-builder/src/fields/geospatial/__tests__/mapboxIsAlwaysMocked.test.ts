import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * No test in this package may reach the real Mapbox SDK.
 *
 * A real `mapbox-gl` map fetches a style, tiles, sprites and fonts from
 * Mapbox's servers. Those are billed requests against a live account, made
 * from a suite that runs on every push — the failure mode is a bill, not a red
 * test — and the map needs a WebGL context jsdom does not have anyway.
 *
 * Each test file that can reach the SDK declares `vi.mock('mapbox-gl/esm')`,
 * and this checks that every one of them does. It is a static check rather
 * than a runtime one on purpose: a runtime guard only protects the files that
 * remember to call it, and the file that forgets is exactly the one at risk.
 * The import graph is followed transitively, so a test mounting a section that
 * mounts a field that draws a map is covered without naming the SDK itself.
 */
const packageSource = join(process.cwd(), 'src');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

const DECLARES_MOCK = /vi\.mock\(\s*['"]mapbox-gl/;
const IMPORTS_MAPBOX =
  /(?:from|import|require)\s*\(?\s*['"]mapbox-gl[^'"]*['"]/;
const SPECIFIER = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [path]
      : [];
  });
}

/**
 * The file a relative specifier names. This package writes explicit
 * extensions, so the specifier is the filename; the extensionless forms are
 * tried anyway rather than silently dropping an edge — a missed edge is a
 * missed test file, and the check would pass for the wrong reason.
 */
function resolveLocal(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ];
  return candidates.find(
    (candidate) =>
      existsSync(candidate) &&
      SOURCE_EXTENSIONS.some((extension) => candidate.endsWith(extension)),
  );
}

const files = sourceFiles(packageSource);
const contents = new Map(
  files.map((file) => [file, readFileSync(file, 'utf8')]),
);

const importsOf = (file: string): string[] =>
  [...(contents.get(file) ?? '').matchAll(SPECIFIER)].flatMap((match) => {
    const resolved =
      match[1] === undefined ? undefined : resolveLocal(file, match[1]);
    return resolved === undefined ? [] : [resolved];
  });

/** Whether this file, or anything it imports, imports the Mapbox SDK. */
function reachesMapbox(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  if (IMPORTS_MAPBOX.test(contents.get(file) ?? '')) return true;
  return importsOf(file).some((imported) => reachesMapbox(imported, seen));
}

const testFiles = files.filter((file) => /\.test\.tsx?$/.test(file));
const exposedTestFiles = testFiles.filter((file) => reachesMapbox(file));
const shortName = (file: string) => relative(packageSource, file);

describe('the Mapbox SDK in this package’s tests', () => {
  /**
   * One production module draws a map, and one test helper reaches for the
   * module to prove it has been replaced. A third importer means something
   * new can reach the SDK, and this check has to be extended to cover it.
   */
  it('is imported by the map preview, and by the mock that replaces it', () => {
    const importers = files
      .filter((file) => IMPORTS_MAPBOX.test(contents.get(file) ?? ''))
      .map(shortName)
      .toSorted();

    expect(importers).toEqual([
      'fields/geospatial/MapPreviewDialog.tsx',
      'fields/geospatial/__tests__/mapboxMock.ts',
    ]);
  });

  it('is reachable from the tests this check is written for', () => {
    // Non-vacuous: if the graph walk stopped finding anything, every test
    // below would pass while proving nothing.
    expect(exposedTestFiles.length).toBeGreaterThanOrEqual(2);
  });

  it.each(exposedTestFiles.map(shortName))(
    'is replaced by %s, which can otherwise reach it',
    (name) => {
      const file = exposedTestFiles.find(
        (candidate) => shortName(candidate) === name,
      );
      expect(
        DECLARES_MOCK.test(contents.get(file ?? '') ?? ''),
        `${name} can reach mapbox-gl but does not mock it: running it would build a real Mapbox map.`,
      ).toBe(true);
    },
  );
});
