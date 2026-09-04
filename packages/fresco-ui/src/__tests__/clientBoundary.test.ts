import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectSourceFiles } from '@codaco/app-i18n/catalog-guards';

/**
 * Every module that renders localized copy declares the client boundary.
 *
 * Fresco is a Next App Router application, so a subpath it imports from a
 * Server Component must say so — an unmarked module is treated as server code
 * and its `useContext` rejected at build time. `useAppIntl` is a `useContext`
 * underneath, so localizing this package turned 45 previously hookless
 * modules into client modules at once. That is a boundary change invisible in
 * a diff that otherwise reads as message strings, and the failure would land
 * in the consuming app rather than here.
 *
 * Scoped to `useAppIntl` deliberately. Eighteen modules in this package used
 * hooks without the directive before any of this work and still do; they are
 * a real gap but not this change's, and widening the assertion to cover them
 * would mean either editing files this branch has no reason to touch or
 * carrying a list of exceptions that nobody prunes.
 */

const DIRECTIVE = /^\s*(['"])use client\1/;
const src = join(import.meta.dirname, '..');

describe('the client boundary', () => {
  it('is declared by every module that formats a message', () => {
    const offenders = collectSourceFiles(src)
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return text.includes('useAppIntl(') && !DIRECTIVE.test(text);
      })
      .map((file) => relative(src, file));

    expect(offenders).toEqual([]);
  });
});
