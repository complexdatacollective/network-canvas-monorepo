import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findUnnamedControls } from '@codaco/e2e-helpers/accessible-name-audit';

/**
 * The committed baselines are the closest available record of what the live
 * accessibility tree contains, so the accessible-name audit is run over all of
 * them here. This is the ratchet in unit-test form: it goes red when a
 * regenerated baseline absorbs an operable control that lost its accessible
 * name, without waiting for anyone to run the browser matrix.
 */
describe('committed ARIA baselines', () => {
  const root = resolve(import.meta.dirname, '../aria-snapshots');

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });

  const baselines = walk(root).filter((path) => path.endsWith('.aria.yml'));

  it('has baselines to audit', () => {
    // Without this, an empty or moved corpus would make the assertion below
    // pass while reading nothing.
    expect(baselines.length).toBeGreaterThan(100);
  });

  it('contains no unnamed controls', () => {
    const found = baselines
      .flatMap((path) => {
        const roles = findUnnamedControls(readFileSync(path, 'utf8'));
        return roles.map((role) => `${path.slice(root.length + 1)}: ${role}`);
      })
      .toSorted();

    expect(found).toEqual([]);
  });
});
