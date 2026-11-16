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

/** A story file, which is a fixture for the copy guards and real UI for the
 * guards that read how a component is CONFIGURED: a story is what Chromatic
 * photographs and what a reviewer looks at, so a button style wrong there is
 * wrong on a page somebody reads. */
const STORY = /\.stories\./;

/**
 * Test-support code, which is a fixture in every sense but its path: the story
 * host and the render harness exist to be rendered BY tests and stories.
 */
const FIXTURE_DIRECTORIES = ['testing'];

const isUnder = (path: string, directories: readonly string[]) => {
  const relativePath = relative(packageSource, path).replaceAll('\\', '/');
  return directories.some(
    (directory) =>
      relativePath === directory || relativePath.startsWith(`${directory}/`),
  );
};

/** Every `.ts`/`.tsx` file a copy guard is entitled to judge. */
export function sourceFiles(
  directory: string = packageSource,
  { withStories = false }: { withStories?: boolean } = {},
): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, { withStories });
    if (
      !SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      return [];
    }
    const isStory = withStories && STORY.test(path);
    if (FIXTURE.test(path) && !isStory) return [];
    // `testing/` holds the story host and the render harness, which are
    // fixtures wherever they are read as COPY — but a story in there is a
    // story like any other: Chromatic photographs it and a reviewer looks at
    // it, so a button styled wrongly there is wrong on a page somebody reads.
    // The directory is excluded for everything else it holds.
    const fixtureDirectories = isStory ? [] : FIXTURE_DIRECTORIES;
    return isUnder(path, fixtureDirectories) ? [] : [path];
  });
}

/** A path as the guards report it: relative to `src`, with forward slashes. */
export const sourcePath = (path: string): string =>
  relative(packageSource, path).replaceAll('\\', '/');
