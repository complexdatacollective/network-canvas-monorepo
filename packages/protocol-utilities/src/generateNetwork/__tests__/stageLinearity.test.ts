import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

describe('stage-linear node writes', () => {
  it("keeps one prompt's fixed attributes off nodes created by another prompt", () => {
    const codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            flagged: { name: 'Flagged', type: 'boolean' },
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
          id: 'flagged-prompt',
          text: 'Name flagged people',
          additionalAttributes: [{ variable: 'flagged', value: true }],
        },
        { id: 'plain-prompt', text: 'Name other people' },
      ],
      behaviours: { minNodes: 1, maxNodes: 2 },
      form: { fields: [{ variable: 'name', prompt: 'Name' }] },
    } as unknown as Stage;

    let observedPlainPrompt = false;
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({ codebook, stages: [stage], seed });
      const flagged = network.nodes.filter((node) =>
        node.promptIDs?.includes('flagged-prompt'),
      );
      const plain = network.nodes.filter((node) =>
        node.promptIDs?.includes('plain-prompt'),
      );
      observedPlainPrompt ||= plain.length > 0;

      expect(
        flagged.every(
          (node) => node[entityAttributesProperty].flagged === true,
        ),
      ).toBe(true);
      expect(
        plain.every(
          (node) => node[entityAttributesProperty].flagged === undefined,
        ),
      ).toBe(true);
    }

    expect(observedPlainPrompt).toBe(true);
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
