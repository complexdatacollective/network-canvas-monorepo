import { describe, expect, test } from 'vitest';

import {
  readSharedFamilyRecord,
  sharedRecordWrites,
  stepsSharingFamily,
} from '../sharedRecord';

const BINDINGS = {
  nameAttribute: 'name',
  sexAssignedAtBirthAttribute: 'sex',
  egoAttribute: 'isEgo',
  kindAttribute: 'kind',
  gestationalCarrierAttribute: 'carried',
  currentPartnerAttribute: 'current',
};

const pedigree = (
  personType: string,
  edgeType: string,
  bindings: Partial<typeof BINDINGS> = {},
) => {
  const bound = { ...BINDINGS, ...bindings };
  return {
    type: 'FamilyPedigree',
    subject: { entity: 'node', type: personType },
    nodeConfiguration: {
      nameAttribute: bound.nameAttribute,
      sexAssignedAtBirthAttribute: bound.sexAssignedAtBirthAttribute,
      egoAttribute: bound.egoAttribute,
    },
    edgeConfiguration: {
      type: edgeType,
      kindAttribute: bound.kindAttribute,
      gestationalCarrierAttribute: bound.gestationalCarrierAttribute,
      currentPartnerAttribute: bound.currentPartnerAttribute,
    },
  };
};

const both = (steps: number[]) => ({ standIns: steps, generatedLabels: steps });

// Rule: who is a stand-in belongs to the family, not to the stage that found
// it out, so every Family Pedigree stage recording the same family — the same
// people and relationships, bound through the same structural attributes —
// sees the same stand-ins. A generated label is a value saved in the name
// attribute, so only stages that also name people through the same attribute
// share labels.
describe('stepsSharingFamily', () => {
  const stages = [
    pedigree('person', 'family'),
    { type: 'Information' },
    pedigree('person', 'family'),
    pedigree('person', 'otherFamily'),
    pedigree('pet', 'family'),
  ];

  test('every Family Pedigree stage over the same people and relationships', () => {
    expect(stepsSharingFamily(stages, 0)).toEqual(both([0, 2]));
    expect(stepsSharingFamily(stages, 2)).toEqual(both([0, 2]));
  });

  test('a stage over other relationships, or other people, keeps its own', () => {
    expect(stepsSharingFamily(stages, 3)).toEqual(both([3]));
    expect(stepsSharingFamily(stages, 4)).toEqual(both([4]));
  });

  test.each([
    'egoAttribute',
    'kindAttribute',
    'gestationalCarrierAttribute',
    'currentPartnerAttribute',
    'sexAssignedAtBirthAttribute',
  ] as const)(
    'a stage binding another %s records another family, sharing nothing',
    (binding) => {
      const differing = [
        pedigree('person', 'family'),
        pedigree('person', 'family', { [binding]: 'other' }),
      ];
      expect(stepsSharingFamily(differing, 0)).toEqual(both([0]));
      expect(stepsSharingFamily(differing, 1)).toEqual(both([1]));
    },
  );

  test('a stage naming people through another attribute shares the stand-ins, not the labels', () => {
    const differing = [
      pedigree('person', 'family'),
      pedigree('person', 'family', { nameAttribute: 'otherName' }),
    ];
    expect(stepsSharingFamily(differing, 0)).toEqual({
      standIns: [0, 1],
      generatedLabels: [0],
    });
    expect(stepsSharingFamily(differing, 1)).toEqual({
      standIns: [0, 1],
      generatedLabels: [1],
    });
  });
});

describe('readSharedFamilyRecord', () => {
  test('a stand-in or label any sharing stage recorded is in the record', () => {
    const record = readSharedFamilyRecord(
      {
        0: { standIns: ['dadStandIn'], generatedLabels: { dadStandIn: 'f1' } },
        2: { framing: 'gamete', standIns: ['auntStandIn'] },
        3: { standIns: ['unrelated'] },
      },
      both([0, 2]),
    );
    expect(record.standIns.toSorted()).toEqual(['auntStandIn', 'dadStandIn']);
    expect(record.generatedLabels).toEqual({ dadStandIn: 'f1' });
  });

  test('a label is read only from stages naming people through the same attribute', () => {
    const record = readSharedFamilyRecord(
      {
        0: { standIns: ['a'], generatedLabels: { a: 'f0' } },
        1: { standIns: ['b'], generatedLabels: { b: 'f1' } },
      },
      { standIns: [0, 1], generatedLabels: [0] },
    );
    expect(record.standIns.toSorted()).toEqual(['a', 'b']);
    expect(record.generatedLabels).toEqual({ a: 'f0' });
  });

  test('ignores records of other kinds', () => {
    expect(
      readSharedFamilyRecord({ 0: [[0, 'a', 'b', true]] }, both([0])),
    ).toEqual({
      generatedLabels: {},
      standIns: [],
    });
  });
});

describe('sharedRecordWrites', () => {
  test('writes the record to every sharing stage, keeping each one’s framing', () => {
    expect(
      sharedRecordWrites(
        { 0: { framing: 'gendered', standIns: ['a'] } },
        both([0, 2]),
        { standIns: ['a', 'b'] },
      ),
    ).toEqual([
      { step: 0, metadata: { framing: 'gendered', standIns: ['a', 'b'] } },
      { step: 2, metadata: { standIns: ['a', 'b'] } },
    ]);
  });

  test('writes nothing where the record would not change', () => {
    expect(
      sharedRecordWrites({ 0: { standIns: ['a'] } }, both([0, 2]), {
        standIns: ['a'],
        generatedLabels: {},
      }),
    ).toEqual([
      { step: 2, metadata: { standIns: ['a'], generatedLabels: {} } },
    ]);
    expect(
      sharedRecordWrites({}, both([0, 2]), {
        standIns: [],
        generatedLabels: {},
      }),
    ).toEqual([]);
  });

  test('writes each part of the record only to the stages sharing it', () => {
    expect(
      sharedRecordWrites(
        { 1: { framing: 'gamete' } },
        { standIns: [0, 1], generatedLabels: [0] },
        { standIns: ['a'], generatedLabels: { a: 'f1' } },
      ),
    ).toEqual([
      { step: 0, metadata: { standIns: ['a'], generatedLabels: { a: 'f1' } } },
      { step: 1, metadata: { framing: 'gamete', standIns: ['a'] } },
    ]);
  });
});
