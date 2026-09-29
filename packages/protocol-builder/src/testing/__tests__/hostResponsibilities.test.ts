import { describe, expect, it } from 'vitest';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';

import {
  contractProcedureTags,
  hostResponsibilities,
} from '../hostResponsibilities.ts';

/**
 * The contract's procedures, read here rather than imported from the module
 * under test.
 *
 * A test that asked the module for the list and then compared it with itself
 * would agree with any answer, including an empty one. This reads each rpc's
 * own `_tag` rather than the map's keys the module reads, so a derivation that
 * reported something other than the procedures disagrees with it.
 */
const declaredTags = (): string[] =>
  Array.from(ProtocolBuilderGroup.requests.values(), (rpc) => rpc._tag);

describe('the host responsibilities', () => {
  /**
   * The list is the contract's, in the contract's order. Both halves matter:
   * a set comparison would pass a list that had reordered itself into
   * something nobody could read beside `group.ts`.
   */
  it('is every procedure the contract declares, in that order', () => {
    const declared = declaredTags();

    expect(declared.length).toBeGreaterThan(0);
    expect(contractProcedureTags()).toEqual(declared);
    expect(hostResponsibilities().map(({ tag }) => tag)).toEqual(declared);
  });

  /**
   * The group is flat, and its tags are the names a host's handlers take.
   * Named rather than left to the comparison above, so a failure says which
   * shape broke.
   */
  it('names each procedure by its tag in the group', () => {
    const tags = contractProcedureTags();

    expect(tags).toContain('RefactorDeleteVariable');
    expect(tags).toContain('ResourcesStage');
    expect(tags).not.toContain('refactor.deleteVariable');
    expect(tags).not.toContain('resources.stage');
  });

  /**
   * Every procedure has a sentence, and no sentence outlives its procedure —
   * `hostResponsibilities` throws in either direction, which is what keeps
   * this list from drifting the way the hand-written one it replaces did.
   */
  it('says something about every one of them, and about nothing else', () => {
    const responsibilities = hostResponsibilities();

    for (const { tag, responsibility } of responsibilities) {
      expect(responsibility, `${tag} has no responsibility`).not.toBe('');
      // A sentence, not a restatement of the name: the old list's failure was
      // rows that said `AcquireLock` acquires a lock.
      expect(responsibility.length, `${tag} says too little`).toBeGreaterThan(
        40,
      );
    }
  });
});
