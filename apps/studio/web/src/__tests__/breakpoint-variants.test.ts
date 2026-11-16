import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STYLESHEET = resolve(SRC, 'styles/globals.css');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Resolves a CSS import as Tailwind does, preferring a package's `style` export. */
function resolveImport(from: string, specifier: string): string {
  if (specifier.startsWith('.')) return resolve(dirname(from), specifier);
  const resolveFrom = createRequire(from);
  const resolved = resolveFrom.resolve(specifier);
  if (resolved.endsWith('.css')) return resolved;
  const manifestPath = resolveFrom.resolve(`${specifier}/package.json`);
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const root =
    isRecord(manifest) && isRecord(manifest.exports)
      ? manifest.exports['.']
      : undefined;
  const style = isRecord(root) ? root.style : undefined;
  if (typeof style !== 'string') {
    throw new Error(`${specifier} has no style export`);
  }
  return resolve(dirname(manifestPath), style);
}

/** Replays one `--breakpoint-*` declaration; `initial` unregisters the name, or every name for `*`. */
function applyBreakpoint(
  registered: Set<string>,
  name: string,
  value: string,
): void {
  if (value.trim() === 'initial') {
    if (name === '*') registered.clear();
    else registered.delete(name);
  } else if (name !== '*') {
    registered.add(name);
  }
}

/**
 * Matches a variant that uses one of `names` as a breakpoint, including a
 * `max-`, `min-` or `not-` prefix. Container-query variants such as `@sm:`
 * are left alone because the theme registers its own container sizes.
 */
const breakpointVariant = (names: readonly string[]): RegExp =>
  new RegExp(
    `(?<![\\w@-])(?:(?:max|min|not)-)?(?:${names.join('|')}):(?=[\\w[!-])`,
    'g',
  );

/**
 * Follows the stylesheet's imports in order and replays every
 * `--breakpoint-*` declaration, so the result is the set of breakpoint
 * variants Tailwind will actually compile for Studio.
 */
function registeredBreakpoints(): {
  defaults: string[];
  registered: Set<string>;
} {
  const registered = new Set<string>();
  const defaults: string[] = [];
  const visited = new Set<string>();

  const visit = (file: string): void => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, 'utf8').replaceAll(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    for (const match of source.matchAll(
      /@import\s+['"]([^'"]+)['"]|--breakpoint-(\*|[\w-]+)\s*:\s*([^;]+);/g,
    )) {
      const [, specifier, name, value] = match;
      if (specifier !== undefined) {
        visit(resolveImport(file, specifier));
      } else if (name !== undefined && value !== undefined) {
        applyBreakpoint(registered, name, value);
        if (
          file.includes('/tailwindcss/') &&
          name !== '*' &&
          value.trim() !== 'initial'
        ) {
          defaults.push(name);
        }
      }
    }
  };
  visit(STYLESHEET);
  return { defaults, registered };
}

const sourceFiles = (): string[] => {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        files.push(path);
      }
    }
  };
  walk(SRC);
  return files.toSorted();
};

describe('breakpoint variants', () => {
  const { defaults, registered } = registeredBreakpoints();
  const unregistered = defaults.filter((name) => !registered.has(name));

  it('unregisters a breakpoint declared initial', () => {
    const names = new Set(['sm', 'md']);
    applyBreakpoint(names, 'sm', ' initial');
    expect([...names]).toEqual(['md']);
    applyBreakpoint(names, 'sm', '40rem');
    expect([...names]).toEqual(['md', 'sm']);
    applyBreakpoint(names, '*', 'initial');
    expect([...names]).toEqual([]);
  });

  it.each([
    ['sm:p-8', ['sm:']],
    ['max-sm:p-8', ['max-sm:']],
    ['min-sm:p-8', ['min-sm:']],
    ['not-sm:p-8', ['not-sm:']],
    ['hover:2xl:flex', ['2xl:']],
    ['@sm:p-8', []],
    ['@max-md:p-8', []],
    ['min-[640px]:p-8', []],
    ["{ sm: 'h-8' }", []],
    ['tablet-portrait:p-8', []],
  ])('finds %s as %j', (sample, expected) => {
    expect(unregistered).toEqual(expect.arrayContaining(['sm', 'md', '2xl']));
    expect(
      Array.from(
        sample.matchAll(breakpointVariant(unregistered)),
        ([found]) => found,
      ),
    ).toEqual(expected);
  });

  // The Fresco theme resets Tailwind's breakpoints, so a default variant such
  // as `sm:p-8` compiles to no CSS and the style silently never applies.
  it('uses no Tailwind default breakpoint the theme does not register', () => {
    expect(defaults.length).toBeGreaterThan(0);

    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(0);

    const variant = breakpointVariant(unregistered);
    const offenders =
      unregistered.length === 0
        ? []
        : files.flatMap((file) =>
            Array.from(
              readFileSync(file, 'utf8').matchAll(variant),
              ([found]) => `${relative(SRC, file)}: ${found}`,
            ),
          );

    expect(offenders).toEqual([]);
  });
});
