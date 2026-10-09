import { describe, expect, test } from 'vitest';

import {
  readSharedFamilyRecord,
  sharedRecordWrites,
  stepsSharingFamily,
} from '../sharedRecord';

const pedigree = (personType: string, edgeType: string) => ({
  type: 'FamilyPedigree',
  subject: { entity: 'node', type: personType },
  edgeConfiguration: { type: edgeType },
});

// Rule: who is a stand-in, and who holds a generated label, belongs to the
// family, not to the stage that found it out. Every Family Pedigree stage
// drawing the same family sees the same record.
describe('stepsSharingFamily', () => {
  const stages = [
    pedigree('person', 'family'),
    { type: 'Information' },
    pedigree('person', 'family'),
    pedigree('person', 'otherFamily'),
    pedigree('pet', 'family'),
  ];

  test('every Family Pedigree stage over the same people and relationships', () => {
    expect(stepsSharingFamily(stages, 0)).toEqual([0, 2]);
    expect(stepsSharingFamily(stages, 2)).toEqual([0, 2]);
  });

  test('a stage over other relationships, or other people, keeps its own', () => {
    expect(stepsSharingFamily(stages, 3)).toEqual([3]);
    expect(stepsSharingFamily(stages, 4)).toEqual([4]);
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
      [0, 2],
    );
    expect(record.standIns.toSorted()).toEqual(['auntStandIn', 'dadStandIn']);
    expect(record.generatedLabels).toEqual({ dadStandIn: 'f1' });
  });

  test('ignores records of other kinds', () => {
    expect(readSharedFamilyRecord({ 0: [[0, 'a', 'b', true]] }, [0])).toEqual({
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
        [0, 2],
        { standIns: ['a', 'b'] },
      ),
    ).toEqual([
      { step: 0, metadata: { framing: 'gendered', standIns: ['a', 'b'] } },
      { step: 2, metadata: { standIns: ['a', 'b'] } },
    ]);
  });

  test('writes nothing where the record would not change', () => {
    expect(
      sharedRecordWrites({ 0: { standIns: ['a'] } }, [0, 2], {
        standIns: ['a'],
        generatedLabels: {},
      }),
    ).toEqual([
      { step: 2, metadata: { standIns: ['a'], generatedLabels: {} } },
    ]);
    expect(
      sharedRecordWrites({}, [0, 2], { standIns: [], generatedLabels: {} }),
    ).toEqual([]);
  });
});
