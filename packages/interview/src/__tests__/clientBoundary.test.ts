import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every module that runs a React hook declares the client boundary.
 *
 * Fresco is a Next App Router application and imports this package directly, so
 * a module it reaches from a Server Component must say so — an unmarked module
 * is treated as server code and its hooks are rejected at build time. The
 * directive is a property of the module rather than of the call site: a module
 * that runs a hook can never evaluate on the server, whether the hook sits in a
 * component body or in a custom hook this package only ever calls from its own
 * client components. Leaving a hook module undeclared makes it correct only for
 * as long as every importer happens to be a client module, which nothing here
 * enforces.
 *
 * This mirrors `packages/fresco-ui/src/__tests__/clientBoundary.test.ts`. Keep
 * the two matchers in step: a gap in one is a gap in the other.
 */

const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/;
const EXCLUDED_FILE_PATTERN =
  /(\.d\.ts$|\.test\.|\.spec\.|\.stories\.|__tests__|__mocks__)/;

/**
 * Shipped source under a directory: `.ts` and `.tsx` alike, excluding tests,
 * stories, and declarations. `.ts` matters as much as `.tsx` — a custom hook in
 * a plain module crosses the boundary exactly as a component does.
 *
 * fresco-ui's guard borrows the identical walk from
 * `@codaco/app-i18n/catalog-guards`, which it already depends on for
 * `useAppIntl`. This package depends on app-i18n neither directly nor for
 * anything else — it reaches `react-intl` only transitively through fresco-ui,
 * as `vitest.config.ts` records — so it keeps its own six-line copy rather than
 * taking a workspace edge on an i18n package to read a directory.
 */
const collectSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(
      (entry) =>
        SOURCE_FILE_PATTERN.test(entry) && !EXCLUDED_FILE_PATTERN.test(entry),
    )
    .map((entry) => join(dir, entry))
    .toSorted();

const DIRECTIVE = /^\s*(['"])use client\1/;

/**
 * Hook-named calls that do not actually cross the boundary, so a module using
 * only these stays server-safe.
 *
 * Base UI's `useRender` merges props and picks an element type; it calls no
 * React hook, which is why Base UI ships it with no directive of its own. No
 * module here relies on that today — the entry is carried so this matcher stays
 * interchangeable with fresco-ui's, where two typography primitives do.
 *
 * Only add a name here after reading its implementation — a hook-shaped name is
 * not evidence either way.
 */
const SERVER_SAFE_HOOKS: ReadonlySet<string> = new Set(['useRender']);

/**
 * Comments are stripped before matching because a module can discuss a hook it
 * never calls, and a match in prose would demand a directive that would be
 * wrong.
 *
 * Line comments are only stripped where `//` does not follow a `:` or a quote,
 * so a URL inside a string cannot truncate the code after it. Erring towards
 * keeping code is the safe direction — it can only cost a false positive, which
 * is visible and arguable, rather than a silent miss.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * `useThing(` or `React.useThing(`, but not some object's `.useThing(`.
 *
 * A type argument may sit between the name and the call — `useMemo<Labels>(…)`
 * is a hook call as much as `useMemo(…)` is, and `forms/buildVariableLabels.ts`
 * ran one in exactly that shape. So `<` counts as an opening bracket here. The
 * prefix is reserved for hooks by convention, so a `use[A-Z]` name followed by
 * `<` is a generic call rather than a comparison.
 *
 * Declarations are removed first so that a module which only *defines* a
 * hook-named helper, without calling a hook, is not mistaken for one that runs
 * one.
 */
const HOOK_CALL = /(?<![\w.$])(?:React\.)?use[A-Z]\w*(?=\s*[(<])/g;

const hooksCalledBy = (text: string): string[] =>
  stripComments(text)
    .replace(/\bfunction\s+use[A-Z]\w*/g, '')
    .match(HOOK_CALL)
    ?.map((name) => name.replace(/^React\./, ''))
    .filter((name) => !SERVER_SAFE_HOOKS.has(name)) ?? [];

const src = join(import.meta.dirname, '..');

describe('the client boundary', () => {
  it('is declared by every module that runs a React hook', () => {
    const offenders = collectSourceFiles(src)
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return hooksCalledBy(text).length > 0 && !DIRECTIVE.test(text);
      })
      .map((file) => relative(src, file));

    expect(offenders).toEqual([]);
  });
});
