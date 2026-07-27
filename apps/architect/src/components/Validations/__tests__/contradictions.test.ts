import { describe, expect, it } from 'vitest';

import {
  buildProspectiveVariables,
  DRAFT_VARIABLE_ID,
  findDraftContradictions,
} from '../contradictions';

const numberVariable = (
  name: string,
  validation: Record<string, unknown> = {},
) => ({ name, type: 'number', validation });

describe('buildProspectiveVariables', () => {
  it('adds a new variable under the draft placeholder id', () => {
    const result = buildProspectiveVariables({
      allVariables: { a: numberVariable('a') },
      currentVariableId: '',
      variableType: 'number',
      validation: { minValue: 1 },
    });
    expect(result[DRAFT_VARIABLE_ID]).toMatchObject({
      type: 'number',
      validation: { minValue: 1 },
    });
    expect(result.a).toEqual(numberVariable('a'));
  });

  it('substitutes the edited variable, keeping its other properties', () => {
    const result = buildProspectiveVariables({
      allVariables: { a: { ...numberVariable('a'), readOnly: true } },
      currentVariableId: 'a',
      variableType: 'number',
      validation: { minValue: 1 },
    });
    expect(result.a).toMatchObject({
      readOnly: true,
      validation: { minValue: 1 },
    });
  });
});

describe('findDraftContradictions', () => {
  it('reports a contradiction the draft introduces', () => {
    const result = findDraftContradictions({
      allVariables: {},
      currentVariableId: '',
      variableType: 'number',
      validation: { minValue: 10, maxValue: 2 },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.message).toContain('is greater than');
  });

  it('reports a contradiction whose offending rule lives on another variable', () => {
    // Editing b's maxValue below a's minimum makes a's comparator impossible.
    const result = findDraftContradictions({
      allVariables: {
        a: numberVariable('a', { minValue: 10, lessThanVariable: 'b' }),
        b: numberVariable('b'),
      },
      currentVariableId: 'b',
      variableType: 'number',
      validation: { maxValue: 5 },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('disjointBounds');
  });

  it('ignores pre-existing contradictions between other variables', () => {
    const result = findDraftContradictions({
      allVariables: {
        a: numberVariable('a', { minValue: 10, maxValue: 2 }),
        b: numberVariable('b'),
      },
      currentVariableId: 'b',
      variableType: 'number',
      validation: { required: true },
    });
    expect(result).toEqual([]);
  });

  it('checks minSelected against draft options', () => {
    const result = findDraftContradictions({
      allVariables: {},
      currentVariableId: '',
      variableType: 'categorical',
      validation: { minSelected: 3 },
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Blue', value: 'blue' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('minSelectedExceedsOptions');
  });
});
