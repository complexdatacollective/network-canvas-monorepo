import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectSourceFiles } from '@codaco/app-i18n/catalog-guards';

/**
 * Every module that runs a React hook declares the client boundary.
 *
 * Fresco is a Next App Router application, so a subpath it imports from a
 * Server Component must say so — an unmarked module is treated as server code
 * and its hooks are rejected at build time. The directive is a property of the
 * module rather than of the call site: a module that runs a hook can never
 * evaluate on the server, whether the hook sits in a component body or in a
 * custom hook this package only ever calls from its own client components.
 * Leaving a hook module undeclared makes it correct only for as long as every
 * importer happens to be a client module, which nothing here enforces.
 */

const DIRECTIVE = /^\s*(['"])use client\1/;

/**
 * Hook-named calls that do not actually cross the boundary, so a module using
 * only these stays server-safe.
 *
 * Base UI's `useRender` merges props and picks an element type; it calls no
 * React hook, which is why Base UI ships it with no directive of its own.
 * `typography/Heading.tsx` and `NativeLink.tsx` rely on that, and
 * `typography/__tests__/TypographyServer.test.tsx` pins it for Heading by
 * rendering it through `renderToStaticMarkup`. Marking either would cost a
 * server-rendered primitive for nothing.
 *
 * Only add a name here after reading its implementation — a hook-shaped name
 * is not evidence either way.
 */
const SERVER_SAFE_HOOKS: ReadonlySet<string> = new Set(['useRender']);

/**
 * Comments are stripped before matching because a module can discuss a hook it
 * never calls: `form/validation/functions.ts` names `useField` and
 * `useAppIntl()` in prose while staying a pure, server-safe module, and a
 * match there would demand a directive that would be wrong.
 *
 * Line comments are only stripped where `//` does not follow a `:` or a quote,
 * so a URL inside a string cannot truncate the code after it. Erring towards
 * keeping code is the safe direction — it can only cost a false positive,
 * which is visible and arguable, rather than a silent miss.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * `useThing(` or `React.useThing(`, but not some object's `.useThing(`.
 * Declarations are removed first so that a module which only *defines* a
 * hook-named helper, without calling a hook, is not mistaken for one that
 * runs one.
 */
const HOOK_CALL = /(?<![\w.$])(?:React\.)?use[A-Z]\w*(?=\s*\()/g;

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
