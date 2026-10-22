import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import {
  changeBetween,
  type FamilyHistoryPoint,
  restoreSide,
} from '../familyHistory';

const person = (id: string, name?: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: 'person',
  [entityAttributesProperty]: name === undefined ? {} : { name },
});

const link = (from: string, to: string): NcEdge => ({
  [entityPrimaryKeyProperty]: `${from}-${to}`,
  type: 'family',
  from,
  to,
  [entityAttributesProperty]: {},
});

const point = (
  nodes: readonly NcNode[],
  edges: readonly NcEdge[] = [],
  stageMetadata: FamilyHistoryPoint['stageMetadata'] = undefined,
): FamilyHistoryPoint => ({ nodes, edges, stageMetadata });

const ids = (entities: readonly (NcNode | NcEdge)[]) =>
  entities.map((entity) => entity[entityPrimaryKeyProperty]);

describe('changeBetween', () => {
  it('is null when nothing changed, even where entities were rewritten alike', () => {
    expect(
      changeBetween(
        point([person('ego'), person('mum', 'Julie')]),
        point([person('ego'), person('mum', 'Julie')]),
      ),
    ).toBeNull();
  });

  it('names the people, relationships and records the change altered', () => {
    const change = changeBetween(
      point([person('ego'), person('mum')], [link('mum', 'ego')], {
        0: { framing: 'gendered' },
      }),
      point(
        [person('ego'), person('mum', 'Julie'), person('gran')],
        [link('mum', 'ego'), link('gran', 'mum')],
        { 0: { framing: 'gendered', standIns: ['gran'] } },
      ),
    );
    expect(change?.nodeIds).toEqual(new Set(['mum', 'gran']));
    expect(change?.edgeIds).toEqual(new Set(['gran-mum']));
    expect(change?.metadata).toEqual([{ step: '0', keys: ['standIns'] }]);
  });
});

describe('restoreSide', () => {
  it('undoes an addition, and redoes it', () => {
    const before = point([person('ego')]);
    const after = point([person('ego'), person('mum')], [link('mum', 'ego')]);
    const change = changeBetween(before, after);
    if (!change) throw new Error('No change');

    const undone = restoreSide(after, change, 'before');
    expect(undone).toEqual(before);
    expect(restoreSide(undone, change, 'after')).toEqual(after);
  });

  it('puts someone removed back in their place, with their relationships', () => {
    const before = point(
      [person('ego'), person('mum', 'Julie'), person('dad')],
      [link('mum', 'ego'), link('dad', 'ego')],
    );
    const after = point([person('ego'), person('dad')], [link('dad', 'ego')]);
    const change = changeBetween(before, after);
    if (!change) throw new Error('No change');

    const undone = restoreSide(after, change, 'before');
    expect(ids(undone.nodes)).toEqual(['ego', 'mum', 'dad']);
    expect(ids(undone.edges)).toEqual(['mum-ego', 'dad-ego']);
  });

  it('keeps what changed since that the change did not alter', () => {
    const before = point([person('ego'), person('mum')]);
    const after = point([person('ego'), person('mum', 'Julie')]);
    const change = changeBetween(before, after);
    if (!change) throw new Error('No change');

    // Since then, someone else was named and someone added.
    const now = point([
      person('ego', 'Alex'),
      person('mum', 'Julie'),
      person('sam'),
    ]);
    const undone = restoreSide(now, change, 'before');
    expect(undone.nodes).toEqual([
      person('ego', 'Alex'),
      person('mum'),
      person('sam'),
    ]);
  });

  it('never leaves a relationship to someone the undo takes away', () => {
    const before = point([person('ego')]);
    const after = point([person('ego'), person('mum')], [link('mum', 'ego')]);
    const change = changeBetween(before, after);
    if (!change) throw new Error('No change');

    // A relationship to the person added was recorded since.
    const now = point(after.nodes, [
      ...after.edges,
      link('mum', 'mum-partner'),
    ]);
    expect(restoreSide(now, change, 'before').edges).toEqual([]);
  });

  it("puts back only the pedigree record's entries the change wrote", () => {
    const before = point([person('ego')], [], {
      0: { generatedLabels: { gran: 'abc' } },
      1: [[0, 'ego', 'gran', true]],
    });
    const after = point([person('ego')], [], {
      0: { generatedLabels: {}, standIns: ['x'] },
      1: [],
    });
    const change = changeBetween(before, after);
    if (!change) throw new Error('No change');

    // The participant chose their words since.
    const now = point([person('ego')], [], {
      0: { framing: 'gamete', generatedLabels: {}, standIns: ['x'] },
      1: [],
    });
    expect(restoreSide(now, change, 'before').stageMetadata).toEqual({
      0: { framing: 'gamete', generatedLabels: { gran: 'abc' } },
      1: [[0, 'ego', 'gran', true]],
    });
  });

  it('takes away a pedigree record left holding nothing', () => {
    const before = point([person('ego')], [], undefined);
    const after = point([person('ego')], [], { 0: { standIns: ['x'] } });
    const change = changeBetween(before, after);
    if (!change) throw new Error('No change');

    expect(restoreSide(after, change, 'before').stageMetadata).toBeUndefined();
  });
});
