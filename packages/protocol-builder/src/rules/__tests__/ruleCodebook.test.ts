import { describe, expect, it } from 'vitest';

import { VariableTypesKeys } from '@codaco/protocol-validation';

import { operatorsByType, ruleVariableTypes } from '../operators.ts';
import {
  ruleEntityTypeExists,
  ruleEntityTypeOptions,
  ruleOperatorOptions,
  ruleVariableChoices,
  ruleVariableOptions,
  ruleVariables,
  ruleVariableType,
} from '../ruleCodebook.ts';
import { testCodebook } from './fixtures.ts';

const codebook = testCodebook;

describe('the rule variable-type catalogue', () => {
  it('is the schema’s own catalogue, not a host display configuration', () => {
    expect([...ruleVariableTypes].toSorted()).toEqual(
      [...VariableTypesKeys].toSorted(),
    );
  });

  it('offers operators for every type the schema has', () => {
    for (const type of VariableTypesKeys) {
      expect(ruleOperatorOptions(type).length).toBeGreaterThan(0);
    }
  });

  it('offers only the existence operators before an attribute is chosen', () => {
    expect(ruleOperatorOptions(undefined).map(({ value }) => value)).toEqual([
      'EXISTS',
      'NOT_EXISTS',
    ]);
    expect([...operatorsByType.exists]).toEqual(['EXISTS', 'NOT_EXISTS']);
  });

  it('offers text attributes their four comparisons', () => {
    expect(ruleOperatorOptions('text').map(({ value }) => value)).toEqual([
      'EXACTLY',
      'NOT',
      'CONTAINS',
      'DOES_NOT_CONTAIN',
    ]);
  });
});

describe('reading the codebook for a rule', () => {
  it('offers an alter rule nothing until an entity type is chosen', () => {
    expect(ruleVariables(codebook, 'node', undefined)).toEqual({});
  });

  it('offers the variables of the entity type a rule names', () => {
    expect(
      ruleVariableOptions(ruleVariables(codebook, 'node', 'person')),
    ).toEqual([
      { value: 'age', label: 'Age', type: 'number' },
      { value: 'mood', label: 'Mood', type: 'categorical' },
      { value: 'note', label: 'Note', type: 'text' },
    ]);
  });

  it('reads an ego rule against the ego codebook', () => {
    expect(
      ruleVariableOptions(ruleVariables(codebook, 'ego', undefined)),
    ).toEqual([{ value: 'egoName', label: 'EgoName', type: 'text' }]);
  });

  it('offers nothing for an entity type the codebook no longer has', () => {
    expect(ruleVariables(codebook, 'node', 'ghost')).toEqual({});
    expect(ruleEntityTypeExists(codebook, 'node', 'ghost')).toBe(false);
    expect(ruleEntityTypeExists(codebook, 'node', 'person')).toBe(true);
  });

  it('answers undefined for the type of a deleted attribute', () => {
    const variables = ruleVariables(codebook, 'node', 'person');
    expect(ruleVariableType(variables, 'favouriteColour')).toBeUndefined();
    expect(ruleVariableType(variables, 'age')).toBe('number');
  });

  it('keeps option values in the type the codebook authored them with', () => {
    const variables = ruleVariables(codebook, 'node', 'person');
    expect(ruleVariableChoices(variables, 'mood')).toEqual([
      { value: 'happy', label: 'Happy' },
      { value: 'sad', label: 'Sad' },
    ]);
    expect(ruleVariableChoices(variables, 'age')).toBeUndefined();
  });

  it('lists the entity types a rule may be pointed at', () => {
    expect(ruleEntityTypeOptions(codebook, 'node')).toEqual([
      {
        value: 'person',
        label: 'Person',
        color: 'node-color-seq-2',
        shape: 'square',
      },
      {
        value: 'place',
        label: 'Place',
        color: 'node-color-seq-3',
        shape: 'circle',
      },
    ]);
    expect(ruleEntityTypeOptions(codebook, 'edge')).toEqual([
      { value: 'friend', label: 'Friend', color: 'edge-color-seq-3' },
    ]);
  });
});
