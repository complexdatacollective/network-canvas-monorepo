import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { promptListDropSound } from '../promptListDrop';

// The drag metadata each kind of person carries when dropped on a prompt's
// list, as the list or the roster that the person is dragged from sets it.

// A person in the network, from a name generator's panel of people named
// for other questions.
const networkNode = {
  [entityPrimaryKeyProperty]: 'a',
  type: 'person',
  [entityAttributesProperty]: { name: 'Alex' },
  promptIDs: ['earlier-prompt'],
  stageId: 'earlier-stage',
  itemType: 'NEW_NODE',
};

// A person from a roster asset, from a name generator's panel.
const externalNode = {
  [entityPrimaryKeyProperty]: 'b',
  type: 'person',
  [entityAttributesProperty]: { name: 'Blake' },
  itemType: 'NEW_NODE',
};

// A person from the roster of a roster name generator.
const rosterItem = {
  id: 'c',
  data: {
    [entityPrimaryKeyProperty]: 'c',
    type: 'person',
    [entityAttributesProperty]: { name: 'Casey' },
  },
  props: { label: 'Casey', data: {} },
  itemType: 'SOURCE_NODES',
};

describe('promptListDropSound', () => {
  it('is the sound of adding a person for a drop that adds a new node: a person from a roster or other external data', () => {
    expect(promptListDropSound(externalNode)).toBe('create-node');
    expect(promptListDropSound(rosterItem)).toBe('create-node');
  });

  it('is toggle-on for a drop that adds a person already in the network to the prompt', () => {
    expect(promptListDropSound(networkNode)).toBe('toggle-on');
  });
});
