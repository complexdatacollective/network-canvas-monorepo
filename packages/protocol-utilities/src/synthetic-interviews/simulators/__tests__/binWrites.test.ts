import { describe, expect, it } from 'vitest';

import type { Stage, Variables } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { buildEntityConstraints } from '../../constraints/buildConstraints';
import {
  type EntityScopeRef,
  scopeKey,
} from '../../constraints/generateEntityAttributes';
import { UniqueRegistry } from '../../constraints/uniqueRegistry';
import { createSessionClock } from '../../session-engine/clock';
import {
  type EngineCodebook,
  SessionEngine,
} from '../../session-engine/engine';
import { createSessionStreams } from '../../session-engine/streams';
import {
  assignBinValue,
  clearOutOfBandWrites,
  existingForRegeneration,
  uniqueSlotFor,
} from '../shared/binWrites';

/**
 * The bookkeeping a binning stage's write leaves behind.
 *
 * A bin value is never validated by the interview — neither binning interface
 * renders a form field for its prompt variable — so two alters sharing a bin
 * is an arrangement the interface offers rather than a duplicate to prevent.
 * What the write must still do is square the `unique` registry with the value
 * it displaced, and record that the value the node now holds is not one the
 * registry issued. Ported from the deleted G2 engine's `assignBinValue`,
 * together with its regression sweep.
 */

const BANDS = [
  { label: 'One', value: 1 },
  { label: 'Two', value: 2 },
  { label: 'Three', value: 3 },
];

const variables = {
  band: {
    name: 'band',
    type: 'ordinal',
    component: 'LikertScale',
    options: BANDS,
    validation: { unique: true },
  },
  bandEcho: {
    name: 'bandEcho',
    type: 'ordinal',
    component: 'LikertScale',
    options: BANDS,
    validation: { sameAs: 'band' },
  },
  mood: {
    name: 'mood',
    type: 'ordinal',
    component: 'LikertScale',
    options: BANDS,
  },
} as unknown as Variables;

const codebook: EngineCodebook = {
  node: { person: { variables: { band: {}, bandEcho: {}, mood: {} } } },
};

const stages = [{ id: 'bins', prompts: [{ id: 'p1' }] }] as unknown as Stage[];

const scope: EntityScopeRef = { entity: 'node', type: 'person' };

const setUp = () => {
  const engine = new SessionEngine({
    codebook,
    stages,
    clock: createSessionClock(
      '2026-08-14T12:00:00.000Z',
      createSessionStreams(1234, 0),
    ),
    egoUid: 'ego-uid',
    captureTrace: false,
  });
  const constraints = buildEntityConstraints(variables, '2026-08-14');
  const uniqueRegistry = new UniqueRegistry();

  const person = (uid: string, attributeData: Record<string, number>): NcNode =>
    engine.addNode({ nodeType: 'person', uid, attributeData, currentStep: 0 });

  const write = (
    node: NcNode,
    set: Record<string, number>,
    unset: string[] = [],
  ) =>
    assignBinValue({
      engine,
      node,
      scope,
      currentStep: 0,
      uniqueRegistry,
      constraints,
      set,
      unset,
    });

  return { engine, constraints, uniqueRegistry, person, write };
};

const slot = (constraints: ReturnType<typeof buildEntityConstraints>) => {
  const found = uniqueSlotFor(constraints, 'band');
  if (!found) throw new Error('band is not in a unique slot');
  return found;
};

describe('a binning stage’s write', () => {
  it('finds the slot a unique variable is issued from', () => {
    const { constraints } = setUp();

    expect(uniqueSlotFor(constraints, 'band')).toBeDefined();
    expect(uniqueSlotFor(constraints, 'mood')).toBeUndefined();
  });

  it('gives back the claim on the value it displaced', () => {
    // The node no longer holds the value the registry issued it, and leaving
    // it claimed drains a space feasibility sized against the entity count.
    const { constraints, uniqueRegistry, person, write } = setUp();
    const node = person('a', { band: 1 });
    const { slot: uniqueSlot } = slot(constraints);
    uniqueRegistry.claim(scopeKey(scope), uniqueSlot, 1);

    write(node, { band: 2 });

    expect(uniqueRegistry.isTaken(scopeKey(scope), uniqueSlot, 1)).toBe(false);
  });

  it('keeps the claim when the bin lands on the value already held', () => {
    const { constraints, uniqueRegistry, person, write } = setUp();
    const node = person('a', { band: 1 });
    const { slot: uniqueSlot } = slot(constraints);
    uniqueRegistry.claim(scopeKey(scope), uniqueSlot, 1);

    write(node, { band: 1 });

    expect(uniqueRegistry.isTaken(scopeKey(scope), uniqueSlot, 1)).toBe(true);
  });

  it('gives back nothing on a value an earlier bin wrote', () => {
    // The second bin overwrites a value the registry never issued, so it has
    // nothing of this node's to give back — and giving one back anyway would
    // be giving back somebody else's.
    const { constraints, uniqueRegistry, person, write } = setUp();
    const node = person('a', {});
    const other = person('b', { band: 2 });
    const { slot: uniqueSlot } = slot(constraints);
    // The registry issued `2` to the OTHER node.
    uniqueRegistry.claim(scopeKey(scope), uniqueSlot, 2);
    expect(other[entityAttributesProperty].band).toBe(2);

    write(node, { band: 2 });
    write(node, { band: 3 });

    expect(uniqueRegistry.isTaken(scopeKey(scope), uniqueSlot, 2)).toBe(true);
  });

  it('keeps the claim a sameAs sibling still carries', () => {
    // The sibling the bin did not write still holds the value the registry
    // issued, so releasing it would offer somebody else a value this node is
    // still holding.
    const { constraints, uniqueRegistry, person, write } = setUp();
    const node = person('a', { band: 1, bandEcho: 1 });
    const { slot: uniqueSlot } = slot(constraints);
    uniqueRegistry.claim(scopeKey(scope), uniqueSlot, 1);

    write(node, { band: 2 });

    expect(uniqueRegistry.isTaken(scopeKey(scope), uniqueSlot, 1)).toBe(true);
  });

  it('gives back the claim on a value the write cleared', () => {
    // A categorical bin's other-bin drop unsets the categorical: nobody holds
    // that value afterwards either.
    const { constraints, uniqueRegistry, person, write } = setUp();
    const node = person('a', { band: 1 });
    const { slot: uniqueSlot } = slot(constraints);
    uniqueRegistry.claim(scopeKey(scope), uniqueSlot, 1);

    write(node, { mood: 2 }, ['band']);

    expect(uniqueRegistry.isTaken(scopeKey(scope), uniqueSlot, 1)).toBe(false);
    expect(node[entityAttributesProperty].band).toBeUndefined();
  });

  describe('what a later regeneration is handed', () => {
    it('drops a variable the bin wrote from the values a redraw reads', () => {
      // A redraw releases the value the entity currently holds before drawing
      // its replacement. That is right for a value the registry issued this
      // entity, and wrong for one a bin wrote.
      const { person, write } = setUp();
      const node = person('a', { mood: 1 });
      write(node, { band: 2 });

      expect(existingForRegeneration(node, new Set(['band']))).toEqual({
        mood: 1,
      });
    });

    it('keeps the variables the bin did not write', () => {
      const { person, write } = setUp();
      const node = person('a', { mood: 1 });
      write(node, { band: 2 });

      expect(existingForRegeneration(node, new Set(['mood']))).toEqual({
        band: 2,
        mood: 1,
      });
    });

    it('hands a node no bin touched exactly what it holds', () => {
      const { person } = setUp();
      const node = person('a', { mood: 1 });

      expect(existingForRegeneration(node, new Set(['mood']))).toBe(
        node[entityAttributesProperty],
      );
    });

    it('stops dropping it once a draw has issued it again', () => {
      // A second form has to give back what the first was issued, so the
      // variable must stop counting as written out of band.
      const { person, write } = setUp();
      const node = person('a', { mood: 1 });
      write(node, { band: 2 });

      clearOutOfBandWrites(node, new Set(['band']));

      expect(existingForRegeneration(node, new Set(['band']))).toEqual({
        band: 2,
        mood: 1,
      });
    });
  });
});
