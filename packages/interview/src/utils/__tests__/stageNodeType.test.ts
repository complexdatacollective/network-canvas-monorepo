import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
} from '@codaco/protocol-validation';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { requireSingleStageNodeType } from '../stageNodeType';

const PERSON = testTypeId('person');
const PET = testTypeId('pet');

const quickAddStage = (types: string[]): Stage => ({
  id: testId('people'),
  type: 'NameGeneratorQuickAdd',
  label: { en: 'People' },
  subject: { entity: 'node', types },
  quickAdd: asEntityAttributeReference(testVariableId('name')),
  prompts: [{ id: testId('people-prompt'), text: { en: 'People' } }],
});

describe('requireSingleStageNodeType', () => {
  it('returns the type of a stage that lists one', () => {
    expect(requireSingleStageNodeType(quickAddStage([PERSON]))).toBe(PERSON);
  });

  it('throws for a stage that lists two types', () => {
    expect(() =>
      requireSingleStageNodeType(quickAddStage([PERSON, PET])),
    ).toThrow('NameGeneratorQuickAdd stage must run exactly one node type');
  });
});
