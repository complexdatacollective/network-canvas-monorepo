import { describe, expect, it } from 'vitest';

import { type Codebook } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../../__tests__/testIds';
import { getVariableTypeReplacements } from '../externalData';

const PERSON = testTypeId('person');
const LIKES = testVariableId('likes');
const RANK = testVariableId('rank');

// Schema 9 renames option values that are not valid names ("Yes " becomes
// "Yes", "1" merges into 1) but leaves roster files as they were, so a roster
// written before the upgrade still has to land on the renamed options.
const codebook = {
  node: {
    [PERSON]: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        [LIKES]: {
          name: 'likes',
          type: 'categorical',
          options: [
            { label: 'Yes', value: 'Yes' },
            { label: 'One', value: 1 },
          ],
        },
        [RANK]: {
          name: 'rank',
          type: 'ordinal',
          options: [
            { label: 'High', value: 'High' },
            { label: 'Low', value: 'Low' },
          ],
        },
      },
    },
  },
} as unknown as Codebook;

const subject = { entity: 'node', type: PERSON } as const;

const row = (attributes: Record<string, unknown>) =>
  ({
    _uid: 'a',
    type: PERSON,
    [entityAttributesProperty]: attributes,
  }) as unknown as NcNode;

const typed = (attributes: Record<string, unknown>) =>
  getVariableTypeReplacements(
    'roster.csv',
    [row(attributes)],
    codebook,
    subject,
  )[0]![entityAttributesProperty];

describe('roster option values renamed by the schema 9 upgrade', () => {
  it('reads a categorical cell spelled as the option was before', () => {
    expect(typed({ [LIKES]: '["Yes ","1"]' })).toEqual({ [LIKES]: ['Yes', 1] });
  });

  it('reads a number cell as the text option it merged into', () => {
    const textFirst = {
      node: {
        [PERSON]: {
          ...codebook.node![PERSON]!,
          variables: {
            [LIKES]: {
              name: 'likes',
              type: 'categorical',
              options: [{ label: 'One', value: '1' }],
            },
          },
        },
      },
    } as unknown as Codebook;
    expect(
      getVariableTypeReplacements(
        'roster.csv',
        [row({ [LIKES]: '[1]' })],
        textFirst,
        subject,
      )[0]![entityAttributesProperty],
    ).toEqual({ [LIKES]: ['1'] });
  });

  it('reads a boolean cell as the text option a legacy boolean became', () => {
    const legacyBoolean = {
      node: {
        [PERSON]: {
          ...codebook.node![PERSON]!,
          variables: {
            [LIKES]: {
              name: 'likes',
              type: 'categorical',
              options: [
                { label: 'Yes', value: 'true' },
                { label: 'No', value: 'false' },
              ],
            },
            [RANK]: {
              name: 'rank',
              type: 'ordinal',
              options: [{ label: 'Yes', value: 'true' }],
            },
          },
        },
      },
    } as unknown as Codebook;
    const read = (file: string, attributes: Record<string, unknown>) =>
      getVariableTypeReplacements(
        file,
        [row(attributes)],
        legacyBoolean,
        subject,
      )[0]![entityAttributesProperty];

    expect(
      read('roster.csv', { [LIKES]: '[true,false]', [RANK]: 'true' }),
    ).toEqual({ [LIKES]: ['true', 'false'], [RANK]: 'true' });
    expect(read('roster.json', { [LIKES]: [true], [RANK]: true })).toEqual({
      [LIKES]: ['true'],
      [RANK]: 'true',
    });
  });

  it('reads an ordinal cell spelled as the option was before', () => {
    expect(typed({ [RANK]: ' Low\t' })).toEqual({ [RANK]: 'Low' });
  });

  it('reads a one-hot column named as the option was before', () => {
    expect(
      typed({ [`${LIKES}_Yes `]: 'true', [`${LIKES}_1`]: 'true' }),
    ).toEqual({
      [LIKES]: ['Yes', 1],
    });
  });

  it('reads a JSON roster answer spelled as the option was before', () => {
    expect(
      getVariableTypeReplacements(
        'roster.json',
        [row({ [LIKES]: ['Yes ', '1'], [RANK]: ' Low', other: ' x ' })],
        codebook,
        subject,
      )[0]![entityAttributesProperty],
    ).toEqual({ [LIKES]: ['Yes', 1], [RANK]: 'Low', other: ' x ' });
  });

  it('names an option once when a roster chose two options that merged', () => {
    expect(typed({ [LIKES]: '["1",1]' })).toEqual({ [LIKES]: [1] });
    expect(typed({ [`${LIKES}_1`]: 'true', [`${LIKES}_ 1`]: 'true' })).toEqual({
      [LIKES]: [1],
    });
    expect(
      getVariableTypeReplacements(
        'roster.json',
        [row({ [LIKES]: ['Yes', 'Yes '] })],
        codebook,
        subject,
      )[0]![entityAttributesProperty],
    ).toEqual({ [LIKES]: ['Yes'] });
  });

  it('keeps a list for an attribute with no options as it is', () => {
    expect(
      getVariableTypeReplacements(
        'roster.json',
        [row({ scores: [1, 1, 2] })],
        codebook,
        subject,
      )[0]![entityAttributesProperty],
    ).toEqual({ scores: [1, 1, 2] });
  });

  it('keeps text that names no option as it is', () => {
    expect(typed({ [LIKES]: '["Maybe"]', [RANK]: 'Middle' })).toEqual({
      [LIKES]: ['Maybe'],
      [RANK]: 'Middle',
    });
  });
});
