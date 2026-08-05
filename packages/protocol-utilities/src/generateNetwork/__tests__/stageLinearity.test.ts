import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

describe('stage-linear node writes', () => {
  it("keeps each prompt's distinct fixed attributes on its own nodes", () => {
    const codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            firstFlag: { name: 'First flag', type: 'boolean' },
            secondFlag: { name: 'Second flag', type: 'boolean' },
          },
        },
      },
    } as unknown as Codebook;
    const stage = {
      id: 'stage-people',
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'first-prompt',
          text: 'Name the first group',
          additionalAttributes: [{ variable: 'firstFlag', value: true }],
        },
        {
          id: 'second-prompt',
          text: 'Name the second group',
          additionalAttributes: [{ variable: 'secondFlag', value: true }],
        },
      ],
      behaviours: { minNodes: 1, maxNodes: 2 },
      form: { fields: [{ variable: 'name', prompt: 'Name' }] },
    } as unknown as Stage;

    let observedSecondPrompt = false;
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({ codebook, stages: [stage], seed });
      const first = network.nodes.filter((node) =>
        node.promptIDs?.includes('first-prompt'),
      );
      const second = network.nodes.filter((node) =>
        node.promptIDs?.includes('second-prompt'),
      );
      observedSecondPrompt ||= second.length > 0;

      expect(
        first.every(
          (node) =>
            node[entityAttributesProperty].firstFlag === true &&
            node[entityAttributesProperty].secondFlag === undefined,
        ),
      ).toBe(true);
      expect(
        second.every(
          (node) =>
            node[entityAttributesProperty].firstFlag === undefined &&
            node[entityAttributesProperty].secondFlag === true,
        ),
      ).toBe(true);
    }

    expect(observedSecondPrompt).toBe(true);
  });

  it('preserves unique and sameAs rules when a Sociogram writes highlights', () => {
    const codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            highlighted: {
              name: 'Highlighted',
              type: 'boolean',
              validation: { unique: true },
            },
            highlightEcho: {
              name: 'Highlight echo',
              type: 'boolean',
              validation: {
                sameAs: asEntityAttributeReference('highlighted'),
              },
            },
          },
        },
      },
    } as unknown as Codebook;
    const people = {
      id: 'stage-people',
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'people', text: 'Name people' }],
      behaviours: { minNodes: 2, maxNodes: 2 },
      form: {
        fields: [{ variable: 'highlightEcho', prompt: 'Initial highlight' }],
      },
    } as unknown as Stage;
    const sociogram = {
      id: 'stage-highlight',
      type: 'Sociogram',
      label: 'Highlight people',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 'highlight',
          text: 'Highlight people',
          highlight: { allowHighlighting: true, variable: 'highlighted' },
        },
      ],
    } as unknown as Stage;

    const { network } = generateNetwork({
      codebook,
      stages: [people, sociogram],
      seed: 1,
      config: { sociogramHighlightProbability: 1 },
    });
    const highlights = network.nodes.map(
      (node) => node[entityAttributesProperty].highlighted,
    );

    expect(new Set(highlights).size).toBe(2);
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty].highlightEcho).toBe(
        node[entityAttributesProperty].highlighted,
      );
    }
  });
});
