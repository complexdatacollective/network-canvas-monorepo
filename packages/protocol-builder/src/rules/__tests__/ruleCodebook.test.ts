import { describe, expect, it } from 'vitest';

import { type Codebook, VariableTypesKeys } from '@codaco/protocol-validation';

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

  it('offers a categorical attribute the operators that count its options', () => {
    // Only a multi-select attribute HAS a number of selected options, so these
    // four are offered for it and for nothing else.
    expect(
      ruleOperatorOptions('categorical').map(({ value }) => value),
    ).toEqual([
      'EXACTLY',
      'NOT',
      'INCLUDES',
      'EXCLUDES',
      'OPTIONS_GREATER_THAN',
      'OPTIONS_LESS_THAN',
      'OPTIONS_EQUALS',
      'OPTIONS_NOT_EQUALS',
    ]);
    expect(ruleOperatorOptions('ordinal').map(({ value }) => value)).toEqual([
      'EXACTLY',
      'NOT',
      'INCLUDES',
      'EXCLUDES',
    ]);
  });
});

/**
 * A codebook holds shapes the editor's own fixtures do not: an edge authored
 * without a colour, entities and attributes whose researcher-facing name has
 * been emptied, a boolean variable carrying the labels its control puts on
 * true and false.
 */
describe('codebook entries that are legal but sparse', () => {
  const sparseCodebook: Readonly<Codebook> = Object.freeze({
    node: {
      blank: {
        name: '',
        color: 'node-color-seq-4',
        shape: { default: 'circle' },
        variables: {
          unnamed: { name: '', type: 'text' },
          agrees: {
            name: 'Agrees',
            type: 'boolean',
            options: [
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ],
          },
          rank: {
            name: 'Rank',
            type: 'ordinal',
            options: [{ label: '', value: 1 }],
          },
        },
      },
    },
    // No colour: the schema leaves an edge's colour optional.
    edge: { plain: { name: '' } },
  });

  it('falls back to the first edge colour when an edge has none', () => {
    expect(ruleEntityTypeOptions(sparseCodebook, 'edge')).toEqual([
      { value: 'plain', label: 'plain', color: 'edge-color-seq-1' },
    ]);
  });

  it('names an entity type and an attribute by id when neither has a name', () => {
    // A blank label would leave the researcher with a rule they cannot read,
    // and a radio with no accessible name at all.
    expect(ruleEntityTypeOptions(sparseCodebook, 'node')[0]?.label).toBe(
      'blank',
    );
    expect(
      ruleVariableOptions(ruleVariables(sparseCodebook, 'node', 'blank')),
    ).toContainEqual({ value: 'unnamed', label: 'unnamed', type: 'text' });
  });

  it('does not offer a boolean control’s own labels as rule operands', () => {
    // A boolean variable carries `options`, but they are what its input
    // control prints for true and false — comparing the attribute against the
    // word "Yes" is a rule that matches nothing.
    const variables = ruleVariables(sparseCodebook, 'node', 'blank');
    expect(ruleVariableChoices(variables, 'agrees')).toBeUndefined();
  });

  it('names an authored option by its value when it has no label', () => {
    const variables = ruleVariables(sparseCodebook, 'node', 'blank');
    expect(ruleVariableChoices(variables, 'rank')).toEqual([
      { value: 1, label: '1' },
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
