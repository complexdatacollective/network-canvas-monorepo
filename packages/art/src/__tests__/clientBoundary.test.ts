import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectSourceFiles } from '@codaco/app-i18n/catalog-guards';

/**
 * Every module that runs a hook React's server build does not provide declares
 * the client boundary.
 *
 * This package is consumed by `apps/documentation`, a Next App Router
 * application, so a module reached from a Server Component is compiled as
 * server code. React ships a separate build for that graph, selected by the
 * `react-server` export condition, and it omits the hooks that need a client:
 * a module importing one of those is rejected at build time with "You're
 * importing a module that depends on `useState` into a React Server Component
 * module". The directive is a property of the module rather than of the call
 * site — a module that runs a client-only hook can never evaluate on the
 * server, whether the hook sits in a component body or in a custom hook this
 * package only ever calls from its own client components.
 *
 * The rule is deliberately narrower than fresco-ui's sibling guard, which
 * demands the directive for any hook at all. That blanket rule costs fresco-ui
 * nothing, because its components are interactive either way. Here it would
 * cost real ground: this package is mostly deterministic SVG that a Server
 * Component can render to static markup, and marking those modules would pull
 * the pattern geometry, seeded RNG and palette code into the client bundle of
 * a statically exported documentation site for no gain.
 */

const DIRECTIVE = /^\s*(['"])use client\1/;

/**
 * Hooks React's server build provides, so a module calling only these stays
 * server-safe. `useMemo` runs its factory, `useCallback` returns its argument,
 * `useId` counts off the render, and `useDebugValue` is a no-op.
 *
 * Pinned against React itself below rather than trusted, and every other name
 * — React's own client hooks and this package's custom ones alike — counts as
 * client-only. Treating an unrecognised `use*` call as client-only can only
 * cost a false positive, which is visible and arguable; the opposite default
 * would let a genuine boundary break reach the consuming app's build.
 */
const SERVER_CAPABLE_HOOKS: ReadonlySet<string> = new Set([
  'useCallback',
  'useDebugValue',
  'useId',
  'useMemo',
]);

/**
 * Comments are stripped before matching so that a module which merely names a
 * hook in prose is not asked for a directive it does not need.
 *
 * Line comments are only stripped where `//` does not follow a `:` or a quote,
 * so a URL inside a string cannot truncate the code after it. Erring towards
 * keeping code is the safe direction — it can only cost a false positive.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * `useThing(` or `React.useThing(`, but not some object's `.useThing(`.
 *
 * A call may carry explicit type arguments before its parentheses, so `<` ends
 * the match as readily as `(` — `useMemo<PatternVariant>(…)` in `Pattern.tsx`
 * and `useRef<(HTMLDivElement | null)[]>([])` in `BackgroundLights.tsx` are
 * both calls, and a pattern that insists on `(` sees neither. Declarations are
 * removed first so that a module which only *defines* a hook-named helper,
 * without calling a hook, is not mistaken for one that runs one.
 */
const HOOK_CALL = /(?<![\w.$])(?:React\.)?use[A-Z]\w*(?=\s*[(<])/g;

const clientOnlyHooksCalledBy = (text: string): string[] =>
  stripComments(text)
    .replace(/\bfunction\s+use[A-Z]\w*/g, '')
    .match(HOOK_CALL)
    ?.map((name) => name.replace(/^React\./, ''))
    .filter((name) => !SERVER_CAPABLE_HOOKS.has(name)) ?? [];

const src = join(import.meta.dirname, '..');

describe('the client boundary', () => {
  it('is declared by every module that runs a client-only hook', () => {
    const offenders = collectSourceFiles(src)
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return (
          clientOnlyHooksCalledBy(text).length > 0 && !DIRECTIVE.test(text)
        );
      })
      .map((file) => relative(src, file));

    expect(offenders).toEqual([]);
  });

  it('exempts exactly the hooks React ships in its server build', () => {
    // The installed React is the authority on which hooks survive into a
    // Server Component, and its server build is a separate entrypoint chosen
    // by an export condition. Loading that file directly reads the same
    // surface the app's server graph gets, without needing the condition set
    // for this test run. A React upgrade that moves a hook across the boundary
    // fails here, where the exemption is stated, rather than in a consuming
    // app's build.
    const require = createRequire(import.meta.url);
    const manifestPath = require.resolve('react/package.json');
    const manifest = require(manifestPath) as {
      exports: Record<'.', Record<'react-server', string>>;
    };
    const serverBuild = require(
      join(dirname(manifestPath), manifest.exports['.']['react-server']),
    ) as Record<string, unknown>;

    const provided = Object.keys(serverBuild)
      .filter((name) => /^use[A-Z]/.test(name))
      .toSorted();

    expect(provided).toEqual([...SERVER_CAPABLE_HOOKS].toSorted());
  });
});
