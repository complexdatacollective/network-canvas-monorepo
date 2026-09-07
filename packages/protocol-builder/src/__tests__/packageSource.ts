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
 * attributes.
 *
 * The five interface families under `sections/` — `network`, `pedigree`,
 * `narrativePedigree`, `geospatial`, `anonymisation` — were listed here while
 * they lived on family F's branch and still carried a `copy?: Partial<…Copy>`
 * each. They have landed converted: every word each family says is a
 * `MessageDescriptor` declared in that family's own `*Messages.ts` (the areas
 * are in `src/locales/ID_MAP.md`), so their exclusions are gone and the rules
 * built on this list cover them like anything else.
 *
 * Excluded by directory rather than by file, and deliberately narrow: these are
 * the only places in the package the rules built on this list do not yet hold.
 * Each entry goes when its area's conversion lands, and the expected-failure
 * discipline in `hostCopyOverrides.test.ts` is what forces that — an exclusion
 * covering a directory with nothing left to excuse FAILS, and so does one
 * naming a directory that is not here at all.
 */
export const NOT_CONVERTED_YET = ['resources'] as const;

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
