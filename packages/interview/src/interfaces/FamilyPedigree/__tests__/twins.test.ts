import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { planRemovePerson } from '../../pedigree-common/membership';
import {
  type AddRelativeRequest,
  areConnected,
  type Family,
  identicalTwinsPossible,
  planAddRelative,
  planTwinChanges,
  readFamily,
  twinsOf,
  type TwinZygosity,
} from '../model';
import { config, link, person } from './fixtures';

// Ruling 16: twins are recorded as identical, fraternal or not known to be
// either.

const family = (nodes: NcNode[], edges: NcEdge[] = []) =>
  readFamily(nodes, edges, config);

/** Ego and Sam, children of Julie and Rob. */
const siblings = (extraEdges: NcEdge[] = [], extraNodes: NcNode[] = []) =>
  family(
    [
      person('ego', { isEgo: true }),
      person('sam', { name: 'Sam' }),
      person('mum', { name: 'Julie', sex: ['female'] }),
      person('dad', { name: 'Rob', sex: ['male'] }),
      ...extraNodes,
    ],
    [
      link('mum', 'ego', 'biological'),
      link('dad', 'ego', 'biological'),
      link('mum', 'sam', 'biological'),
      link('dad', 'sam', 'biological'),
      ...extraEdges,
    ],
  );

const siblingRequest = (
  twin: TwinZygosity | undefined,
): AddRelativeRequest => ({
  relation: 'sibling',
  sharedParentIds: ['mum', 'dad'],
  sharesUnshown: 'none',
  parentKind: 'biological',
  carrier: null,
  twin,
});

const plan = (f: Family, request: AddRelativeRequest) => {
  let counter = 0;
  return planAddRelative({
    family: f,
    anchorId: 'ego',
    newPersonId: 'added',
    details: {},
    request,
    createId: () => `new-${++counter}`,
    sexAttribute: config.sexAssignedAtBirthAttribute,
  });
};

describe('reading twins', () => {
  test('a twin edge is read as twins of its zygosity, and is no parent or partner link', () => {
    const f = siblings([link('ego', 'sam', 'identicalTwin')]);
    expect(f.twins).toEqual([
      {
        id: 'ego-sam-identicalTwin',
        source: 'ego',
        target: 'sam',
        zygosity: 'identical',
      },
    ]);
    expect(f.links.map((each) => each.kind)).not.toContain('identicalTwin');
    expect(twinsOf(f, 'sam')).toEqual([
      { twinId: 'ego', zygosity: 'identical', linkId: 'ego-sam-identicalTwin' },
    ]);
  });

  test('twins are connected, so cannot be connected again', () => {
    const f = siblings([link('ego', 'sam', 'fraternalTwin')]);
    expect(areConnected(f, 'sam', 'ego')).toBe(true);
  });

  test('removing a twin removes their twin edge', () => {
    const f = siblings([link('ego', 'sam', 'fraternalTwin')]);
    expect(planRemovePerson(f, 'sam').linkIds).toContain(
      'ego-sam-fraternalTwin',
    );
  });
});

describe('identical twins', () => {
  test('have the same genetic parents', () => {
    expect(identicalTwinsPossible(siblings(), 'ego', 'sam')).toBe(true);
    const halfSiblings = family(
      [
        person('ego', { isEgo: true }),
        person('sam'),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('dad', { name: 'Rob', sex: ['male'] }),
        person('al', { name: 'Al', sex: ['male'] }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
        link('al', 'sam', 'biological'),
      ],
    );
    expect(identicalTwinsPossible(halfSiblings, 'ego', 'sam')).toBe(false);
  });
});

describe('adding a twin', () => {
  test('records the new sibling as the anchor’s twin', () => {
    expect(plan(siblings(), siblingRequest('fraternal')).twins).toEqual([
      { source: 'ego', target: 'added', zygosity: 'fraternal' },
    ]);
  });

  test('records no twin for a sibling who is not one', () => {
    expect(plan(siblings(), siblingRequest(undefined)).twins ?? []).toEqual([]);
  });

  test('records identical twins as not known to be identical when they would not share their genetic parents', () => {
    const result = plan(siblings(), {
      ...siblingRequest('identical'),
      sharedParentIds: ['mum'],
    } as AddRelativeRequest);
    expect(result.twins).toEqual([
      { source: 'ego', target: 'added', zygosity: 'unknown' },
    ]);
  });

  test('makes a triplet of the anchor’s twin too', () => {
    const f = siblings([link('ego', 'sam', 'identicalTwin')]);
    expect(plan(f, siblingRequest('identical')).twins).toEqual([
      { source: 'ego', target: 'added', zygosity: 'identical' },
      { source: 'sam', target: 'added', zygosity: 'identical' },
    ]);
    expect(plan(f, siblingRequest('fraternal')).twins).toEqual([
      { source: 'ego', target: 'added', zygosity: 'fraternal' },
      { source: 'sam', target: 'added', zygosity: 'fraternal' },
    ]);
  });
});

describe('changing someone’s twins', () => {
  test('adds, changes and removes twin edges to match the answers', () => {
    const f = siblings(
      [
        link('ego', 'sam', 'unknownZygosityTwin'),
        link('mum', 'kim', 'biological'),
        link('dad', 'kim', 'biological'),
        link('mum', 'lee', 'biological'),
        link('dad', 'lee', 'biological'),
        link('ego', 'lee', 'fraternalTwin'),
      ],
      [person('kim', { name: 'Kim' }), person('lee', { name: 'Lee' })],
    );
    expect(
      planTwinChanges(
        f,
        'ego',
        new Map([
          ['sam', 'identical'],
          ['kim', 'fraternal'],
        ]),
      ),
    ).toEqual({
      added: [{ source: 'ego', target: 'kim', zygosity: 'fraternal' }],
      changed: [
        { linkId: 'ego-sam-unknownZygosityTwin', zygosity: 'identical' },
      ],
      removedLinkIds: ['ego-lee-fraternalTwin'],
    });
  });
});
