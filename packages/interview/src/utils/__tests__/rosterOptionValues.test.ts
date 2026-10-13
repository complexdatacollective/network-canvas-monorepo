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

  it('reads an ordinal cell spelled as the option was before', () => {
    expect(typed({ rank: ' Low\t' })).toEqual({ rank: 'Low' });
  });

  it('reads a one-hot column named as the option was before', () => {
    expect(typed({ 'likes_Yes ': 'true', 'likes_1': 'true' })).toEqual({
      likes: ['Yes', 1],
    });
  });

  it('keeps text that names no option as it is', () => {
    expect(typed({ likes: '["Maybe"]', rank: 'Middle' })).toEqual({
      likes: ['Maybe'],
      rank: 'Middle',
    });
  });
});
