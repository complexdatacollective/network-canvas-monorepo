import { describe, expect, it } from 'vitest';

import { type Codebook } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import { getVariableTypeReplacements } from '../externalData';

// Schema 9 renames option values that are not valid names ("Yes " becomes
// "Yes", "1" merges into 1) but leaves roster files as they were, so a roster
// written before the upgrade still has to land on the renamed options.
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        likes: {
          name: 'likes',
          type: 'categorical',
          options: [
            { label: 'Yes', value: 'Yes' },
            { label: 'One', value: 1 },
          ],
        },
        rank: {
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

const subject = { entity: 'node', type: 'person' } as const;

const row = (attributes: Record<string, unknown>) =>
  ({
    _uid: 'a',
    type: 'person',
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
    expect(typed({ likes: '["Yes ","1"]' })).toEqual({ likes: ['Yes', 1] });
  });

  it('reads a number cell as the text option it merged into', () => {
    const textFirst = {
      node: {
        person: {
          ...codebook.node!.person!,
          variables: {
            likes: {
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
        [row({ likes: '[1]' })],
        textFirst,
        subject,
      )[0]![entityAttributesProperty],
    ).toEqual({ likes: ['1'] });
  });

  it('reads a boolean cell as the text option a legacy boolean became', () => {
    const legacyBoolean = {
      node: {
        person: {
          ...codebook.node!.person!,
          variables: {
            likes: {
              name: 'likes',
              type: 'categorical',
              options: [
                { label: 'Yes', value: 'true' },
                { label: 'No', value: 'false' },
              ],
            },
            rank: {
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

    expect(read('roster.csv', { likes: '[true,false]', rank: 'true' })).toEqual(
      { likes: ['true', 'false'], rank: 'true' },
    );
    expect(read('roster.json', { likes: [true], rank: true })).toEqual({
      likes: ['true'],
      rank: 'true',
    });
  });

  it('reads an ordinal cell spelled as the option was before', () => {
    expect(typed({ rank: ' Low\t' })).toEqual({ rank: 'Low' });
  });

  it('reads a one-hot column named as the option was before', () => {
    expect(typed({ 'likes_Yes ': 'true', 'likes_1': 'true' })).toEqual({
      likes: ['Yes', 1],
    });
  });

  it('reads a JSON roster answer spelled as the option was before', () => {
    expect(
      getVariableTypeReplacements(
        'roster.json',
        [row({ likes: ['Yes ', '1'], rank: ' Low', other: ' x ' })],
        codebook,
        subject,
      )[0]![entityAttributesProperty],
    ).toEqual({ likes: ['Yes', 1], rank: 'Low', other: ' x ' });
  });

  it('names an option once when a roster chose two options that merged', () => {
    expect(typed({ likes: '["1",1]' })).toEqual({ likes: [1] });
    expect(typed({ 'likes_1': 'true', 'likes_ 1': 'true' })).toEqual({
      likes: [1],
    });
    expect(
      getVariableTypeReplacements(
        'roster.json',
        [row({ likes: ['Yes', 'Yes '] })],
        codebook,
        subject,
      )[0]![entityAttributesProperty],
    ).toEqual({ likes: ['Yes'] });
  });

  it('keeps text that names no option as it is', () => {
    expect(typed({ likes: '["Maybe"]', rank: 'Middle' })).toEqual({
      likes: ['Maybe'],
      rank: 'Middle',
    });
  });
});
