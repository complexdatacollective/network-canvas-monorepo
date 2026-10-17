import { describe, expect, test } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { planRemovePerson } from '../../pedigree-common/membership';
import {
  type AddRelativeRequest,
  areConnected,
  areLinked,
  type Family,
  identicalTwinsPossible,
  planAddRelative,
  planStandIns,
  planTwinChanges,
  readFamily,
  twinCandidatesOf,
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

// Derived facts follow their premises: identical twins came from one egg and
// one sperm, so have the same genetic parents. Asked of the family after every
// change to anyone's parents, alongside the stand-in rule (`planStandIns`):
// identical twins whose genetic parents a change makes differ are recorded as
// not known to be identical, never left contradicting their parents.
describe('identical twins after a change to their parents', () => {
  const standInRule = (f: Family) => {
    let counter = 0;
    return planStandIns(
      f,
      () => `stand-in-${++counter}`,
      config.sexAssignedAtBirthAttribute,
      undefined,
    );
  };

  test('a biological parent added to one of them leaves them not known to be identical', () => {
    const f = family(
      [person('ego', { isEgo: true }), person('sam', { name: 'Sam' })],
      [link('ego', 'sam', 'identicalTwin')],
    );
    const result = plan(f, {
      relation: 'parent',
      parentKind: 'biological',
      carriedPregnancy: false,
      partnerId: null,
      partnershipCurrent: true,
      alsoParentOf: [],
    });
    expect(result.changedTwins).toEqual([
      { linkId: 'ego-sam-identicalTwin', zygosity: 'unknown' },
    ]);
  });

  test('a parent they share added to both keeps them identical', () => {
    const f = family(
      [person('ego', { isEgo: true }), person('sam', { name: 'Sam' })],
      [link('ego', 'sam', 'identicalTwin')],
    );
    const result = plan(f, {
      relation: 'parent',
      parentKind: 'biological',
      carriedPregnancy: false,
      partnerId: null,
      partnershipCurrent: true,
      alsoParentOf: ['sam'],
    });
    expect(result.changedTwins ?? []).toEqual([]);
  });

  test('a shared parent re-described as a social parent of one leaves them not known to be identical', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('sam', { name: 'Sam' }),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('dad', { name: 'Rob', sex: ['male'] }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
        link('dad', 'sam', 'social'),
        link('ego', 'sam', 'identicalTwin'),
      ],
    );
    expect(standInRule(f).changedTwins).toEqual([
      { linkId: 'ego-sam-identicalTwin', zygosity: 'unknown' },
    ]);
  });

  test('identical twins who share their genetic parents are left as they are', () => {
    expect(
      standInRule(siblings([link('ego', 'sam', 'identicalTwin')])).changedTwins,
    ).toEqual([]);
  });

  test('twins not recorded as identical are left as they are', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('sam', { name: 'Sam' }),
        person('mum', { name: 'Julie', sex: ['female'] }),
        person('dad', { name: 'Rob', sex: ['male'] }),
        person('al', { name: 'Al', sex: ['male'] }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('dad', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
        link('al', 'sam', 'biological'),
        link('ego', 'sam', 'fraternalTwin'),
      ],
    );
    expect(standInRule(f).changedTwins).toEqual([]);
  });

  test('changing someone’s twins never keeps a pair identical whose genetic parents differ', () => {
    // Sam and Kim saved as identical though Kim's father is Al, not Rob.
    const f = siblings(
      [
        link('mum', 'kim', 'biological'),
        link('al', 'kim', 'biological'),
        link('sam', 'kim', 'identicalTwin'),
      ],
      [
        person('kim', { name: 'Kim' }),
        person('al', { name: 'Al', sex: ['male'] }),
      ],
    );
    expect(
      planTwinChanges(
        f,
        'ego',
        new Map([
          ['sam', 'fraternal'],
          ['kim', 'fraternal'],
        ]),
      ).changed,
    ).toEqual([{ linkId: 'sam-kim-identicalTwin', zygosity: 'unknown' }]);
  });

  test('identical twins with one donor and no parent raising them share one stand-in, and stay identical', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('sam', { name: 'Sam' }),
        person('donor', { name: 'Dana', sex: ['female'] }),
      ],
      [
        link('donor', 'ego', 'donor'),
        link('donor', 'sam', 'donor'),
        link('ego', 'sam', 'identicalTwin'),
      ],
    );
    const result = standInRule(f);
    expect(result.people).toHaveLength(1);
    expect(result.changedTwins).toEqual([]);
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
      // Sam, now identical to the participant, is Kim's twin too.
      added: [
        { source: 'ego', target: 'kim', zygosity: 'fraternal' },
        { source: 'sam', target: 'kim', zygosity: 'fraternal' },
      ],
      changed: [
        { linkId: 'ego-sam-unknownZygosityTwin', zygosity: 'identical' },
      ],
      removedLinkIds: ['ego-lee-fraternalTwin'],
    });
  });
});

// Twins form a set — siblings by the kinship model's own test, born of one
// pregnancy — with a twin link between every pair, and every change keeps the
// set whole.
describe('a twin set', () => {
  /** Ego, Sam and Kim, children of Julie and Rob. */
  const threeSiblings = (twinEdges: NcEdge[]) =>
    siblings(
      [
        link('mum', 'kim', 'biological'),
        link('dad', 'kim', 'biological'),
        ...twinEdges,
      ],
      [person('kim', { name: 'Kim' })],
    );

  test('a twin added from the person form joins the whole set of the twin chosen', () => {
    // Kim is already Sam's twin; making the participant Sam's twin makes
    // them Kim's too.
    const f = threeSiblings([link('sam', 'kim', 'fraternalTwin')]);
    expect(planTwinChanges(f, 'ego', new Map([['sam', 'fraternal']]))).toEqual({
      added: [
        { source: 'ego', target: 'sam', zygosity: 'fraternal' },
        { source: 'ego', target: 'kim', zygosity: 'fraternal' },
      ],
      changed: [],
      removedLinkIds: [],
    });
  });

  test('a twin added to someone already in a set is the twin of everyone in it', () => {
    // The participant is already Kim's twin; adding Sam makes Sam Kim's twin.
    const f = threeSiblings([link('ego', 'kim', 'unknownZygosityTwin')]);
    expect(
      planTwinChanges(
        f,
        'ego',
        new Map([
          ['kim', 'unknown'],
          ['sam', 'fraternal'],
        ]),
      ).added,
    ).toEqual([
      { source: 'ego', target: 'sam', zygosity: 'fraternal' },
      { source: 'kim', target: 'sam', zygosity: 'fraternal' },
    ]);
  });

  test('someone unticked leaves the set, and the others stay twins', () => {
    const f = threeSiblings([
      link('ego', 'sam', 'fraternalTwin'),
      link('ego', 'kim', 'fraternalTwin'),
      link('sam', 'kim', 'fraternalTwin'),
    ]);
    expect(planTwinChanges(f, 'ego', new Map([['sam', 'fraternal']]))).toEqual({
      added: [],
      changed: [],
      removedLinkIds: ['ego-kim-fraternalTwin', 'sam-kim-fraternalTwin'],
    });
  });

  test('unticking every twin takes the person out of the set, and the others stay twins', () => {
    const f = threeSiblings([
      link('ego', 'sam', 'fraternalTwin'),
      link('ego', 'kim', 'fraternalTwin'),
      link('sam', 'kim', 'fraternalTwin'),
    ]);
    expect(planTwinChanges(f, 'ego', new Map())).toEqual({
      added: [],
      changed: [],
      removedLinkIds: ['ego-sam-fraternalTwin', 'ego-kim-fraternalTwin'],
    });
  });

  test('twins are identical only when every pair through them is', () => {
    const f = threeSiblings([link('ego', 'sam', 'identicalTwin')]);
    expect(
      planTwinChanges(
        f,
        'ego',
        new Map([
          ['sam', 'identical'],
          ['kim', 'identical'],
        ]),
      ).added,
    ).toEqual([
      { source: 'ego', target: 'kim', zygosity: 'identical' },
      { source: 'sam', target: 'kim', zygosity: 'identical' },
    ]);
    expect(
      planTwinChanges(
        f,
        'ego',
        new Map([
          ['sam', 'identical'],
          ['kim', 'fraternal'],
        ]),
      ).added,
    ).toEqual([
      { source: 'ego', target: 'kim', zygosity: 'fraternal' },
      { source: 'sam', target: 'kim', zygosity: 'fraternal' },
    ]);
  });

  test('a set recorded with a pair missing is made whole', () => {
    const f = threeSiblings([
      link('ego', 'sam', 'fraternalTwin'),
      link('ego', 'kim', 'fraternalTwin'),
    ]);
    expect(
      planTwinChanges(
        f,
        'ego',
        new Map([
          ['sam', 'fraternal'],
          ['kim', 'fraternal'],
        ]),
      ).added,
    ).toEqual([{ source: 'sam', target: 'kim', zygosity: 'fraternal' }]);
  });

  test('a new sibling added as a twin joins every member of the anchor’s set', () => {
    // A set recorded with the anchor's link to Kim missing still brings Kim.
    const f = threeSiblings([
      link('ego', 'sam', 'fraternalTwin'),
      link('sam', 'kim', 'fraternalTwin'),
    ]);
    expect(
      plan(f, siblingRequest('fraternal')).twins?.map((twin) => twin.source),
    ).toEqual(['ego', 'sam', 'kim']);
  });
});

describe('who could be someone’s twin', () => {
  test('a step-sibling, who shares only a social parent, could not', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('mum', { sex: ['female'] }),
        person('step', { name: 'Stepdad', sex: ['male'] }),
        person('stepkid', { name: 'Ash' }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('step', 'ego', 'social'),
        link('step', 'stepkid', 'biological'),
      ],
    );
    expect(twinCandidatesOf(f, 'ego')).toEqual([]);
  });

  test('siblings adopted together could, as adoptive siblings', () => {
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('sib', { name: 'Sam' }),
        person('amy', { sex: ['female'] }),
      ],
      [link('amy', 'ego', 'adoptive'), link('amy', 'sib', 'adoptive')],
    );
    expect(twinCandidatesOf(f, 'ego')).toEqual(['sib']);
  });

  test('a sibling whose twins are not all the person’s siblings could not', () => {
    // Kim is Sam's twin through their father, but not the participant's
    // sibling, so the participant cannot join their set.
    const f = family(
      [
        person('ego', { isEgo: true }),
        person('sam', { name: 'Sam' }),
        person('kim', { name: 'Kim' }),
        person('mum', { sex: ['female'] }),
        person('dad', { sex: ['male'] }),
      ],
      [
        link('mum', 'ego', 'biological'),
        link('mum', 'sam', 'biological'),
        link('dad', 'sam', 'biological'),
        link('dad', 'kim', 'biological'),
        link('sam', 'kim', 'fraternalTwin'),
      ],
    );
    expect(twinCandidatesOf(f, 'ego')).toEqual([]);
  });
});

describe('disconnecting', () => {
  test('twins have no link the disconnect tool removes', () => {
    const f = siblings([link('ego', 'sam', 'fraternalTwin')]);
    expect(areLinked(f, 'ego', 'sam')).toBe(false);
    expect(areLinked(f, 'mum', 'sam')).toBe(true);
  });
});
