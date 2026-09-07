import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * This package's own source tree, for the guards that read it as TEXT.
 *
 * The jsdom environment does not give a test module a `file:` URL, so the
 * package root comes from the runner's working directory. Every caller asserts
 * it rather than assuming it (see `looksLikeThisPackage`), so a runner that
 * moves makes those tests fail rather than quietly checking nothing.
 */
export const packageSource = join(process.cwd(), 'src');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/** Fixtures render throwaway copy on purpose, and nobody translates a fixture. */
const FIXTURE = /(\.test\.|\.stories\.|__tests__|__mocks__)/;

/**
 * Test-support code, which is a fixture in every sense but its path: the story
 * host and the render harness exist to be rendered BY tests and stories.
 */
const FIXTURE_DIRECTORIES = ['testing'];

/**
 * The areas whose localisation has not landed yet, by directory.
 *
 * `resources/` is the localisation branch's to convert, and until that lands it
 * holds both a `ResourcePickerCopy` of plain strings and English JSX
 * attributes. The five interface families under `sections/` are family F's,
 * whose sections still carry a `copy?: Partial<…Copy>` each — the ids are
 * reserved in `src/locales/ID_MAP.md` (`networkCanvas`, `pedigree`,
 * `narrativePedigree`, `geospatial`, `anonymisation`) and the copy joins them
 * there. Those five directories do not exist on this branch; they are kept
 * here rather than dropped so the merge with family F is a union, and
 * `hostCopyOverrides.test.ts` names them explicitly so the list cannot quietly
 * rot instead.
 *
 * Excluded by directory rather than by file, and deliberately narrow: these are
 * the only places in the package the rules built on this list do not yet hold.
 * Each entry goes when its area's conversion lands, and the expected-failure
 * discipline in `hostCopyOverrides.test.ts` is what forces that — an exclusion
 * covering a directory with nothing left to excuse FAILS.
 */
export const NOT_CONVERTED_YET = [
  'resources',
  'sections/network',
  'sections/pedigree',
  'sections/narrativePedigree',
  'sections/geospatial',
  'sections/anonymisation',
] as const;

const isUnder = (path: string, directories: readonly string[]) => {
  const relativePath = relative(packageSource, path).replaceAll('\\', '/');
  return directories.some(
    (directory) =>
      relativePath === directory || relativePath.startsWith(`${directory}/`),
  );
};

/**
 * Every `.ts`/`.tsx` file a copy guard is entitled to judge.
 *
 * `excluding` defaults to the not-yet-converted areas; a caller checking that
 * one of those areas still holds an offender passes `[]` to look inside it.
 */
export function sourceFiles(
  directory: string = packageSource,
  { excluding = NOT_CONVERTED_YET as readonly string[] } = {},
): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, { excluding });
    if (
      !SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      return [];
    }
    if (FIXTURE.test(path)) return [];
    return isUnder(path, [...excluding, ...FIXTURE_DIRECTORIES]) ? [] : [path];
  });
}

/** A path as the guards report it: relative to `src`, with forward slashes. */
export const sourcePath = (path: string): string =>
  relative(packageSource, path).replaceAll('\\', '/');
