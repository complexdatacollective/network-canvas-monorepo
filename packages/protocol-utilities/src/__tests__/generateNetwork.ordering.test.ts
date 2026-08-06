import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';

/**
 * Behaviours that depend on WHEN a stage runs rather than on what it declares:
 * a value one stage fixes and a later one asks about again, an edge whose
 * endpoints do not all exist yet, and a panel drawn part-way through a run.
 *
 * These are the ordering effects a plan-first generator has to reproduce
 * deliberately: the plan settles the network's final state up front, so
 * without them a session would show every value in its final form from the
 * moment the entity appears, and would link people who had not been named yet.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const rows = (attributes: Record<string, unknown>[]): NcNode[] =>
  attributes.map(
    (values, index) =>
      ({
        [entityPrimaryKeyProperty]: `row-${index}`,
        type: 'person',
        [entityAttributesProperty]: values,
      }) as unknown as NcNode,
  );

const codebook = (
  variables: Record<string, unknown>,
  edgeVariables: Record<string, unknown> = {},
): Codebook =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables,
        synthetic: { count: { distribution: 'constant', value: 3 } },
      },
    },
    edge: {
      friend: {
        name: 'Friend',
        color: 'edge-color-seq-1',
        variables: edgeVariables,
      },
    },
    ego: { variables: {} },
  }) as unknown as Codebook;

const nameGenerator = (overrides: Record<string, unknown> = {}): Stage =>
  stage({
    id: 'ng',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'ng-p1', text: 'Who?' }],
    behaviours: { minNodes: 3, maxNodes: 3 },
    ...overrides,
  });

const alterForm = (id: string, ...variables: string[]): Stage =>
  stage({
    id,
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    form: { fields: variables.map((variable) => ({ variable, prompt: '?' })) },
  });

const attributesOf = (node: NcNode) => node[entityAttributesProperty];

describe('a value one stage fixes and a later one asks again', () => {
  const withClose = codebook({
    name: { name: 'Name', type: 'text' },
    close: { name: 'Close', type: 'boolean' },
  });

  const fixingGenerator = nameGenerator({
    prompts: [
      {
        id: 'ng-p1',
        text: 'Who are you close to?',
        additionalAttributes: [{ variable: 'close', value: true }],
      },
    ],
  });

  it('keeps the fixed value where nothing asks again', () => {
    const { network } = generateNetwork({
      seed: 4,
      codebook: withClose,
      stages: [fixingGenerator],
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(attributesOf(node).close).toBe(true);
    }
  });

  it('lets the later form land a value of its own over the fixed one', () => {
    // The prompt asserts `close` on everyone it names; a later form asks the
    // same question again, and what the participant answers there is the
    // network's final state. Planning the prompt's assertion as final instead
    // would make the second stage unable to disagree with the first.
    const seeds = Array.from({ length: 40 }, (_, index) => index + 1);
    const answers = new Set<unknown>();

    for (const seed of seeds) {
      const { network } = generateNetwork({
        seed,
        codebook: withClose,
        stages: [fixingGenerator, alterForm('form', 'close')],
      });
      for (const node of network.nodes) answers.add(attributesOf(node).close);
    }

    expect(answers.has(false)).toBe(true);
    expect(answers.has(true)).toBe(true);
  });

  it('keeps a roster row’s own data through a later form pass', () => {
    // A row is external data bound to this person rather than an answer the
    // interview collected, so a form displaying it does not invent a new one.
    const { network } = generateNetwork({
      seed: 9,
      codebook: withClose,
      stages: [
        stage({
          id: 'roster',
          type: 'NameGeneratorRoster',
          label: 'Roster',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'roster-p1', text: 'Pick people' }],
          behaviours: { minNodes: 2, maxNodes: 2 },
        }),
        alterForm('form', 'name'),
      ],
      externalData: {
        roster: rows([{ name: 'Ada' }, { name: 'Grace' }]),
      },
    });

    const names = network.nodes.map((node) => String(attributesOf(node).name));
    expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([
      'Ada',
      'Grace',
    ]);
  });
});

describe('edges over a population that is still growing', () => {
  it('never links a pair before both of them have been named', () => {
    // A census sitting between two name generators can only ask about the
    // people named so far. Pairing across the whole final network instead
    // would put an edge in the session before one of its endpoints exists.
    const protocol = {
      codebook: codebook({ name: { name: 'Name', type: 'text' } }),
      stages: [
        nameGenerator({
          id: 'ng-early',
          behaviours: { minNodes: 2, maxNodes: 2 },
        }),
        stage({
          id: 'census',
          type: 'DyadCensus',
          label: 'Who knows whom',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'c-p1',
              text: 'Do they know each other?',
              createEdge: 'friend',
            },
          ],
        }),
        nameGenerator({
          id: 'ng-late',
          behaviours: { minNodes: 4, maxNodes: 4 },
        }),
      ],
    };

    for (let seed = 1; seed <= 25; seed++) {
      const { network } = generateNetwork({ ...protocol, seed });
      const namedEarly = new Set(
        network.nodes
          .filter((node) => node.stageId === 'ng-early')
          .map((node) => node[entityPrimaryKeyProperty]),
      );

      for (const edge of network.edges) {
        expect(namedEarly.has(edge.from) && namedEarly.has(edge.to)).toBe(true);
      }
    }
  });
});

describe('a name generator given a panel', () => {
  it('draws the panel’s rows and still adds people of its own', () => {
    // A panel is a shortcut for naming someone already known, not a closed
    // list: its rows arrive as real people, and the stage keeps fabricating
    // once the panel runs out.
    const { network } = generateNetwork({
      seed: 5,
      codebook: codebook({ name: { name: 'Name', type: 'text' } }),
      stages: [
        nameGenerator({
          panels: [
            { id: 'panel-1', title: 'Everyone', dataSource: 'existing' },
          ],
        }),
      ],
      externalData: { ng: rows([{ name: 'Ada' }]) },
    });

    expect(network.nodes).toHaveLength(3);
    const names = network.nodes.map((node) => attributesOf(node).name);
    expect(names).toContain('Ada');
    expect(new Set(names).size).toBe(3);
  });
});

describe('a half-built stage', () => {
  // Architect previews a stage while it is still being authored, so analysis
  // has to tolerate a draft missing properties the schema requires rather
  // than throwing and collapsing the preview into its failure screen.
  const drafts: [string, Record<string, unknown>][] = [
    ['no subject yet', { id: 'd', type: 'NameGeneratorQuickAdd', label: 'D' }],
    [
      'no form yet',
      {
        id: 'd',
        type: 'AlterForm',
        label: 'D',
        subject: { entity: 'node', type: 'person' },
      },
    ],
    [
      'a prompt with no variable chosen',
      {
        id: 'd',
        type: 'OrdinalBin',
        label: 'D',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'd-p1', text: 'Which?' }],
      },
    ],
    [
      'a sociogram prompt with no layout chosen',
      {
        id: 'd',
        type: 'Sociogram',
        label: 'D',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: 'd-p1', text: 'Place them' }],
      },
    ],
    [
      'a pedigree with no node configuration',
      { id: 'd', type: 'FamilyPedigree', label: 'D' },
    ],
  ];

  it.each(drafts)('generates alongside one with %s', (_why, draft) => {
    const { network } = generateNetwork({
      seed: 2,
      codebook: codebook({ name: { name: 'Name', type: 'text' } }),
      stages: [nameGenerator(), stage(draft)],
    });

    expect(network.nodes).toHaveLength(3);
  });
});
