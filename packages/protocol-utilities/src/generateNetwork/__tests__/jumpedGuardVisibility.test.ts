import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * A guard reading a variable that only a JUMPED-OVER form collects. The
 * session skips the flag form on consent, reaches the creator with the flag
 * unanswered, and the creator runs; a guard judged against the original
 * analysis instead saw the drawn flag, settled the creator as skipped, and
 * left materialisation walking into a creator with nothing planned for it.
 */
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'Name', type: 'text' } },
    },
  },
  edge: {},
  ego: {
    variables: {
      consent: {
        name: 'Consent',
        type: 'boolean',
        synthetic: { probabilityTrue: 1 },
      },
      flag: {
        name: 'Flag',
        type: 'boolean',
        synthetic: { probabilityTrue: 1 },
      },
    },
  },
} as unknown as Codebook;

const egoForm = (id: string, variable: string, skipped?: boolean): Stage =>
  ({
    id,
    type: 'EgoForm',
    label: id,
    introductionPanel: { title: id, text: id },
    form: { fields: [{ variable, prompt: `${variable}?` }] },
    ...(skipped
      ? {
          skipLogic: {
            action: 'SKIP',
            filter: {
              rules: [
                {
                  id: 'consented',
                  type: 'ego',
                  options: {
                    attribute: 'consent',
                    operator: 'EXACTLY',
                    value: true,
                  },
                },
              ],
            },
          },
        }
      : {}),
  }) as unknown as Stage;

const guardedCreator = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 2 } },
  behaviours: { minNodes: 2, maxNodes: 2 },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'p1', text: 'Name people' }],
  skipLogic: {
    action: 'SKIP',
    filter: {
      rules: [
        {
          id: 'flagged',
          type: 'ego',
          options: { attribute: 'flag', operator: 'EXACTLY', value: true },
        },
      ],
    },
  },
} as unknown as Stage;

describe('a guard reading a jumped-over ego write', () => {
  it('plans the creator the session actually reaches', () => {
    // consent = true skips the flag form; the creator's guard then reads an
    // ego who never answered `flag`, so `SKIP when flag is true` does not
    // fire and the creator runs. Its people must therefore be planned.
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [
          egoForm('stage-consent', 'consent'),
          egoForm('stage-flag', 'flag', true),
          guardedCreator,
        ],
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes, `seed ${seed}`).toHaveLength(2);
    }
  });

  it('still settles the skip where the flag form is reached', () => {
    // Without the consent jump the flag IS collected, the guard fires, and
    // the creator is skipped — the settled-guard machinery unchanged.
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [
          egoForm('stage-consent', 'consent'),
          egoForm('stage-flag', 'flag'),
          guardedCreator,
        ],
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes, `seed ${seed}`).toHaveLength(0);
    }
  });
});
