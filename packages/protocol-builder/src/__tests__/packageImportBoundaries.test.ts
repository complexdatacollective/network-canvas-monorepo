import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// The jsdom environment does not give this module a `file:` URL, so the
// package root comes from the runner's working directory instead. It is
// asserted below rather than assumed, so a runner that moves makes this test
// fail rather than quietly checking nothing.
const packageSource = join(process.cwd(), 'src');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

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
 * Every module specifier in a file, from either import form.
 *
 * A regular expression rather than a parse: this guards against a whole
 * CLASS of specifier, and the point is that no shape of import — static,
 * dynamic, type-only, re-export — can slip past by being written differently.
 */
const SPECIFIER = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

const specifiersIn = (contents: string): string[] =>
  [...contents.matchAll(SPECIFIER)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

/**
 * Specifiers this package may never contain.
 *
 * - `~/…` is a HOST's path alias. A consumer typechecks this package's source
 *   inside its own TypeScript program, where the consumer's `paths` win, so an
 *   alias here resolves against the wrong root — silently, and differently in
 *   each consumer.
 * - Anything reaching into `apps/` is an Architect (or other host) module. The
 *   whole point of the package is that a Studio host can render the same
 *   editors without Architect being present at all.
 */
const isForbidden = (specifier: string): boolean =>
  specifier.startsWith('~/') ||
  specifier.startsWith('~\\') ||
  specifier.includes('/apps/') ||
  specifier.startsWith('apps/') ||
  /(^|\/)architect(\/|$)/.test(specifier);

describe('package import boundaries', () => {
  it('is looking at this package’s own source', () => {
    expect(existsSync(join(packageSource, 'protocol-context.ts'))).toBe(true);
    expect(sourceFiles(packageSource).length).toBeGreaterThan(20);
  });

  it('imports no host alias and no application module', () => {
    const offenders = sourceFiles(packageSource).flatMap((file) => {
      const contents = readFileSync(file, 'utf8');
      return specifiersIn(contents)
        .filter(isForbidden)
        .map(
          (specifier) =>
            `${relative(packageSource, file)} imports ${specifier}`,
        );
    });

    expect(offenders).toEqual([]);
  });
});
