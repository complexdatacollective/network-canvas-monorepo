import { describe, expect, it } from 'vitest';

import {
  type Codebook,
  type Variables,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

import { operatorsForSubject, ruleVariableTypes } from '../operators.ts';
import {
  missingOperandOptions,
  ruleEntityTypeExists,
  ruleEntityTypeOptions,
  ruleOperatorOptions,
  ruleVariableChoices,
  ruleVariableDateParameters,
  ruleVariableOptions,
  ruleVariables,
  ruleVariableType,
} from '../ruleCodebook.ts';
import { testCodebook } from './fixtures.ts';

const codebook = testCodebook;

describe('the rule variable-type catalogue', () => {
  it('is the schema’s own catalogue, less the types no operand can be entered for', () => {
    // Read from the schema rather than from a host display configuration, and
    // narrowed by one thing only: whether the protocol can hold a value to
    // compare an attribute of that type against. A layout attribute is
    // answered with a point, and `filterValueSchema` holds numbers, strings,
    // booleans and lists — so no rule can be built against one, and offering
    // it would put an attribute in the picker with an empty operator list.
    expect([...ruleVariableTypes].toSorted()).toEqual(
      [...VariableTypesKeys].filter((type) => type !== 'layout').toSorted(),
    );
  });

  it('offers operators for every type it offers at all', () => {
    for (const type of ruleVariableTypes) {
      expect(ruleOperatorOptions(type).length).toBeGreaterThan(0);
    }
    expect(ruleOperatorOptions('layout')).toEqual([]);
  });

  it('offers only the existence operators before an attribute is chosen', () => {
    expect(ruleOperatorOptions(undefined).map(({ value }) => value)).toEqual([
      'EXISTS',
      'NOT_EXISTS',
    ]);
    expect([...operatorsForSubject('exists')]).toEqual([
      'EXISTS',
      'NOT_EXISTS',
    ]);
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
 * The list is narrower than the schema on purpose, and a native select shows
 * its placeholder for a value that matches no option — so an operator left out
 * of the list is one the researcher cannot see, cannot correct, and saves back
 * unchanged.
 */
describe('an operator a stored rule holds that the list leaves out', () => {
  it('adds a presence operator the schema still accepts, selectable', () => {
    const options = ruleOperatorOptions('number', 'EXISTS');

    expect(options.at(-1)).toEqual({
      value: 'EXISTS',
      label: 'exists (no longer offered)',
    });
    // The schema accepts it, so the researcher is being shown their own rule
    // rather than sent to fix something that is not wrong.
    expect(options.at(-1)?.disabled).toBeUndefined();
  });

  it('adds an operator the attribute’s type does not allow, disabled', () => {
    expect(ruleOperatorOptions('text', 'GREATER_THAN').at(-1)).toEqual({
      value: 'GREATER_THAN',
      label: 'is greater than (not valid for this attribute)',
      disabled: true,
    });
  });

  it('adds nothing for an operator the list already holds, or for a non-operator', () => {
    const offered = ruleOperatorOptions('number');
    expect(ruleOperatorOptions('number', 'GREATER_THAN')).toEqual(offered);
    expect(ruleOperatorOptions('number', undefined)).toEqual(offered);
    expect(ruleOperatorOptions('number', 'NOT_AN_OPERATOR')).toEqual(offered);
  });
});

/**
 * A rule's operand is compared against the stored answer verbatim, so the date
 * control has to be the same control the attribute is answered with — bounds
 * included. Reading only the resolution left a rule able to name a date the
 * attribute's own picker could never record.
 */
describe('the date picker a rule’s operand inherits', () => {
  const variables: Readonly<Variables> = Object.freeze({
    born: {
      name: 'Born',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'year', min: '1800', max: '1810' },
    },
    seen: {
      name: 'Seen',
      type: 'datetime',
      component: 'DatePicker',
    },
    met: {
      name: 'Met',
      type: 'datetime',
      component: 'RelativeDatePicker',
      parameters: { anchor: '2020-01-01', before: 30, after: 30 },
    },
    age: { name: 'Age', type: 'number' },
  });

  it('carries every bound the attribute’s own picker honours', () => {
    expect(ruleVariableDateParameters(variables, 'born')).toEqual({
      type: 'year',
      min: '1800',
      max: '1810',
    });
  });

  it('invents no bound the codebook does not hold', () => {
    expect(ruleVariableDateParameters(variables, 'seen')).toEqual({
      type: 'full',
    });
  });

  it('gives a relative date picker the full date it records, and no bounds', () => {
    expect(ruleVariableDateParameters(variables, 'met')).toEqual({
      type: 'full',
    });
  });

  it('gives anything that is not a date attribute the default picker', () => {
    expect(ruleVariableDateParameters(variables, 'age')).toEqual({
      type: 'full',
    });
    expect(ruleVariableDateParameters(variables, undefined)).toEqual({
      type: 'full',
    });
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

/**
 * A rule can be left naming an option that is no longer there — a collaborator
 * renames "Retired" to "Not working", or deletes it — and nothing else notices:
 * the attribute still exists, the operator is still legal for its type, and the
 * operand is still the shape an option value has.
 */
describe('an operand naming an option the attribute no longer offers', () => {
  const variables = ruleVariables(codebook, 'node', 'person');

  it('names the option that went missing', () => {
    expect(
      missingOperandOptions(variables, 'mood', 'EXACTLY', 'retired'),
    ).toEqual(['retired']);
  });

  it('says nothing about an option the attribute still authors', () => {
    expect(
      missingOperandOptions(variables, 'mood', 'EXACTLY', 'happy'),
    ).toEqual([]);
  });

  it('checks every member of a list operand', () => {
    expect(
      missingOperandOptions(variables, 'mood', 'INCLUDES', [
        'happy',
        'retired',
        'lapsed',
      ]),
    ).toEqual(['retired', 'lapsed']);
  });

  it('holds the option to the type the codebook authored it with', () => {
    // The interview compares the operand against the stored answer by
    // identity, so the string "1" is not the option whose value is 1.
    const numericOptions: Readonly<Codebook> = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            strength: {
              name: 'Strength',
              type: 'ordinal',
              options: [
                { label: 'Weak', value: 1 },
                { label: 'Strong', value: 2 },
              ],
            },
          },
        },
      },
    };
    const ordinal = ruleVariables(numericOptions, 'node', 'person');

    expect(missingOperandOptions(ordinal, 'strength', 'EXACTLY', 1)).toEqual(
      [],
    );
    expect(missingOperandOptions(ordinal, 'strength', 'EXACTLY', '1')).toEqual([
      '1',
    ]);
    // The widening that let a number attribute take a fraction has no business
    // here: an ordinal answers with one of its own options.
    expect(missingOperandOptions(ordinal, 'strength', 'EXACTLY', 0.5)).toEqual([
      0.5,
    ]);
  });

  it('says nothing about a comparison whose operand is not an option', () => {
    // A number attribute's operand is typed out, not picked, so there is no
    // option list to hold it to; a presence rule compares nothing at all.
    expect(missingOperandOptions(variables, 'age', 'EXACTLY', 41)).toEqual([]);
    expect(
      missingOperandOptions(variables, 'mood', 'EXISTS', 'retired'),
    ).toEqual([]);
  });

  it('says nothing about an operand that has not been entered yet', () => {
    expect(
      missingOperandOptions(variables, 'mood', 'EXACTLY', undefined),
    ).toEqual([]);
    expect(missingOperandOptions(variables, 'mood', 'INCLUDES', [])).toEqual(
      [],
    );
  });

  it('says nothing about an attribute the codebook has lost', () => {
    expect(
      missingOperandOptions(variables, 'favouriteColour', 'EXACTLY', 'blue'),
    ).toEqual([]);
  });
});
