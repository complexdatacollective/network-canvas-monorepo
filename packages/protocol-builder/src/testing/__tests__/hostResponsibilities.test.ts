import { describe, expect, it } from 'vitest';

import { contract } from '@codaco/protocol-builder-core/contract';

import {
  contractProcedurePaths,
  hostResponsibilities,
} from '../hostResponsibilities.ts';

/**
 * The contract's procedures, walked here rather than imported from the module
 * under test.
 *
 * A test that asked the module for the list and then compared it with itself
 * would agree with any answer, including an empty one. This walk is written
 * against `@orpc/contract`'s own marker and knows nothing about the module's
 * implementation, so a derivation that stopped recursing into `resources` — or
 * started reporting the groups themselves as procedures — disagrees with it.
 */
const walkContract = (node: object, prefix: string): string[] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value !== 'object' || value === null) return [];
    return '~orpc' in value ? [path] : walkContract(value, path);
  });

describe('the host responsibilities', () => {
  /**
   * The list is the contract's, in the contract's order. Both halves matter:
   * a set comparison would pass a list that had reordered itself into
   * something nobody could read beside `contract.ts`.
   */
  it('is every procedure the contract declares, in that order', () => {
    const declared = walkContract(contract, '');

    expect(declared.length).toBeGreaterThan(0);
    expect(contractProcedurePaths()).toEqual(declared);
    expect(hostResponsibilities().map(({ path }) => path)).toEqual(declared);
  });

  /**
   * The nested groups are the part a shallow read gets wrong: `refactor` and
   * `resources` are not procedures, and their members are. Named rather than
   * left to the comparison above, so a failure says which shape broke.
   */
  it('reads through the contract’s groups rather than reporting them', () => {
    const paths = contractProcedurePaths();

    expect(paths).toContain('refactor.deleteVariable');
    expect(paths).toContain('resources.stage');
    expect(paths).not.toContain('refactor');
    expect(paths).not.toContain('resources');
  });

  /**
   * Every procedure has a sentence, and no sentence outlives its procedure —
   * `hostResponsibilities` throws in either direction, which is what keeps
   * this list from drifting the way the hand-written one it replaces did.
   */
  it('says something about every one of them, and about nothing else', () => {
    const responsibilities = hostResponsibilities();

    for (const { path, responsibility } of responsibilities) {
      expect(responsibility, `${path} has no responsibility`).not.toBe('');
      // A sentence, not a restatement of the name: the old list's failure was
      // rows that said `acquireLock` acquires a lock.
      expect(responsibility.length, `${path} says too little`).toBeGreaterThan(
        40,
      );
    }
  });
});
