import { describe, expect, it } from 'vitest';

import type { Variable } from '@codaco/protocol-validation';

import { SyntheticInterview } from '../SyntheticInterview';

/** The variables of one node type, as the emitted codebook holds them. */
const variablesOf = (
  si: SyntheticInterview,
  typeId: string,
): Record<string, Variable> =>
  (
    si.getProtocol().codebook.node?.[typeId] as
      | { variables?: Record<string, Variable> }
      | undefined
  )?.variables ?? {};

/**
 * An id the caller supplies is reserved so later minting steps over it. That
 * protects ids minted AFTERWARDS and nothing else: an id already in the map —
 * the seeded name variable `addNodeType` creates, or an earlier explicit
 * declaration — was simply overwritten by the `set` that followed. The first
 * variable vanished from the codebook while every handle and stage reference
 * taken against it went on resolving, silently, to the caller's new
 * definition.
 *
 * A builder cannot hold two variables under one id, so it is refused where it
 * is asked for rather than lost where it is stored.
 */
describe('an explicit variable id that is already in use', () => {
  it('is refused rather than replacing the variable holding it', () => {
    const si = new SyntheticInterview(42);
    const person = si.addNodeType({ name: 'Person' });
    // Whatever `addNodeType` seeded is already in this type's variable map.
    const seeded = variablesOf(si, person.id);
    const takenId = Object.keys(seeded)[0];
    expect(takenId).toBeDefined();

    expect(() =>
      person.addVariable({ id: takenId, type: 'number', name: 'takenAgain' }),
    ).toThrow(/already in use/);

    // And the original is still there, unchanged.
    const after = variablesOf(si, person.id);
    expect(Object.keys(after)).toContain(takenId);
    expect(after[takenId!]?.type).toBe(seeded[takenId!]?.type);
  });

  it('still accepts an explicit id nothing holds', () => {
    const si = new SyntheticInterview(42);
    const person = si.addNodeType({ name: 'Person' });
    const added = person.addVariable({
      id: 'a-free-id',
      type: 'number',
      name: 'age',
    });

    expect(added.id).toBe('a-free-id');
    const variables = variablesOf(si, person.id);
    expect(variables['a-free-id']).toBeDefined();
  });
});
