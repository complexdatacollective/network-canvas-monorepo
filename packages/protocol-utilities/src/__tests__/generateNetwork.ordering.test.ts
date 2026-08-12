import { describe, expect, it } from 'vitest';

/** Every eligible pair linked, which each edge type used to declare itself. */
const FULL_DENSITY = {
  topology: {
    metric: 'density',
    distribution: { distribution: 'constant', value: 1 },
  },
};

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
          synthetic: FULL_DENSITY,
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

describe('a stage filtered on an edge an earlier stage created', () => {
  // `close` is listed first so the codebook's own order disagrees with the
  // interview's: the planner has to settle `friend` first regardless, or the
  // census that reads it is judged against a network whose edges have not
  // been planned yet.
  const twoEdgeTypes = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: { name: { name: 'Name', type: 'text' } },
        synthetic: { count: { distribution: 'constant', value: 4 } },
      },
    },
    edge: {
      close: {
        name: 'Close',
        color: 'edge-color-seq-2',
        variables: {},
      },
      friend: {
        name: 'Friend',
        color: 'edge-color-seq-1',
        variables: {},
      },
    },
    ego: { variables: {} },
  } as unknown as Codebook;

  const census = (id: string, edgeType: string, filter?: unknown): Stage =>
    stage({
      id,
      type: 'DyadCensus',
      label: 'Pairs',
      subject: { entity: 'node', type: 'person' },
      synthetic: FULL_DENSITY,
      prompts: [{ id: `${id}-p1`, text: 'Which?', createEdge: edgeType }],
      ...(filter ? { filter } : {}),
    });

  const stages = [
    nameGenerator({ behaviours: { minNodes: 4, maxNodes: 4 } }),
    census('friends', 'friend'),
    census('closeness', 'close', {
      join: 'AND',
      rules: [
        {
          id: 'r1',
          type: 'edge',
          options: { type: 'friend', operator: 'EXISTS' },
        },
      ],
    }),
  ];

  it('plans its edges over the people the filter actually admits', () => {
    // Everyone is a friend by the time the second census runs, so its
    // `EXISTS` filter admits all four and its own density of 1 links every
    // pair. Judged against an edgeless shadow the same filter admits nobody
    // — the plan would hold no `close` edge at all, for a protocol that in
    // session produces six.
    const { network } = generateNetwork({
      seed: 11,
      codebook: twoEdgeTypes,
      stages,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(4);
    const byType = (type: string) =>
      network.edges.filter((edge) => edge.type === type);
    expect(byType('friend')).toHaveLength(6);
    expect(byType('close')).toHaveLength(6);
  });
});

describe('a declared distribution', () => {
  it('reaches the draw rather than falling back to the default', () => {
    // The draw resolves a variable's distribution from the entry the
    // constraint layer builds, so a declared distribution has to survive that
    // translation. It once did not: counts and topology kept working while
    // every per-variable distribution quietly returned to its default.
    const { network } = generateNetwork({
      seed: 7,
      codebook: codebook({
        name: { name: 'Name', type: 'text' },
        age: {
          name: 'Age',
          type: 'number',
          validation: { minValue: 0, maxValue: 120 },
          synthetic: { distribution: 'constant', value: 41 },
        },
      }),
      stages: [nameGenerator(), alterForm('form', 'age')],
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(attributesOf(node).age).toBe(41);
    }
  });
});

describe('a number variable declared in fractions', () => {
  it('is not rounded away to the nearest whole value', () => {
    // Whole values are the default because that is how participants answer an
    // integer control, but an author who writes 0.5 has asked for something
    // else, and rounding returns a number they did not declare.
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook({
        name: { name: 'Name', type: 'text' },
        share: {
          name: 'Share',
          type: 'number',
          validation: { minValue: 0, maxValue: 1 },
          synthetic: { distribution: 'constant', value: 0.5 },
        },
      }),
      stages: [nameGenerator(), alterForm('form', 'share')],
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(attributesOf(node).share).toBe(0.5);
    }
  });

  it('stays continuous even when its parameters are whole', () => {
    // Integrality is a property of the distribution, not of how its
    // parameters happen to be spelled: a uniform over 0 to 1 rounded to whole
    // values is not a uniform, it is a coin.
    const values = new Set<unknown>();
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: codebook({
          name: { name: 'Name', type: 'text' },
          share: {
            name: 'Share',
            type: 'number',
            validation: { minValue: 0, maxValue: 1 },
            synthetic: { distribution: 'uniform', min: 0, max: 1 },
          },
        }),
        stages: [nameGenerator(), alterForm('form', 'share')],
      });
      for (const node of network.nodes) values.add(attributesOf(node).share);
    }

    expect([...values].some((value) => !Number.isInteger(value))).toBe(true);
  });

  it('rounds the default, which is how an integer control is answered', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook({
        name: { name: 'Name', type: 'text' },
        age: {
          name: 'Age',
          type: 'number',
          validation: { minValue: 0, maxValue: 120 },
        },
      }),
      stages: [nameGenerator(), alterForm('form', 'age')],
    });

    for (const node of network.nodes) {
      expect(Number.isInteger(attributesOf(node).age)).toBe(true);
    }
  });
});

describe('a variable certain to be unanswered', () => {
  it('is null even where only the walk can draw it', () => {
    // A write reachable solely through a filter is left unplanned, because
    // only the session as it stands can say who the filter admits. That draw
    // happens during the walk, and without missingness applied there a
    // declaration of 1 comes back populated — the declaration inverted.
    const { network } = generateNetwork({
      seed: 5,
      codebook: codebook({
        name: { name: 'Name', type: 'text' },
        note: {
          name: 'Note',
          type: 'text',
          synthetic: { missingProbability: 1 },
        },
      }),
      stages: [
        nameGenerator(),
        stage({
          id: 'filtered',
          type: 'AlterForm',
          label: 'About some of them',
          subject: { entity: 'node', type: 'person' },
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'r1',
                type: 'node',
                options: { type: 'person', operator: 'EXISTS' },
              },
            ],
          },
          form: { fields: [{ variable: 'note', prompt: '?' }] },
        }),
      ],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(attributesOf(node).note).toBeNull();
    }
  });
});

describe('an edge whose earliest creating stage is skipped', () => {
  it('is made by the next stage that can create it', () => {
    // An edge is planned at the earliest stage that could create it. Skip
    // logic can bypass exactly that stage while a later one creates the same
    // type, and an edge pinned to the index it was planned at is then never
    // made — while the census answers, which read planned membership, go on
    // reporting it as a link the session does not hold.
    const withScreening = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: { name: { name: 'Name', type: 'text' } },
          synthetic: { count: { distribution: 'constant', value: 4 } },
        },
      },
      edge: {
        friend: {
          name: 'Friend',
          color: 'edge-color-seq-1',
          variables: {},
        },
      },
      ego: { variables: { skip: { name: 'Skip', type: 'boolean' } } },
    } as unknown as Codebook;

    const census = (id: string, extra: Record<string, unknown> = {}) =>
      stage({
        id,
        type: 'DyadCensus',
        synthetic: FULL_DENSITY,
        label: 'Pairs',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: `${id}-p1`, text: 'Which?', createEdge: 'friend' }],
        ...extra,
      });

    const { network, stageMetadata } = generateNetwork({
      seed: 6,
      codebook: withScreening,
      stages: [
        nameGenerator({ behaviours: { minNodes: 4, maxNodes: 4 } }),
        // Always skipped: ego holds no value for `skip`, so the rule fails.
        census('skipped', {
          skipLogic: {
            action: 'SKIP',
            filter: {
              join: 'AND',
              rules: [
                {
                  id: 'r1',
                  type: 'ego',
                  options: { attribute: 'skip', operator: 'NOT_EXISTS' },
                },
              ],
            },
          },
        }),
        census('reached'),
      ],
      respectSkipLogicAndFiltering: true,
    });

    // Density 1 over four people: every pair is linked, and the stage that
    // ran is the one that made them.
    expect(network.edges).toHaveLength(6);

    // And no answer describes an edge the session does not hold.
    const linked = new Set(
      network.edges.map((edge) =>
        edge.from < edge.to
          ? `${edge.from} ${edge.to}`
          : `${edge.to} ${edge.from}`,
      ),
    );
    for (const tuples of Object.values(stageMetadata ?? {})) {
      for (const [, a, b, answered] of tuples as [
        number,
        string,
        string,
        boolean,
      ][]) {
        const key = a < b ? `${a} ${b}` : `${b} ${a}`;
        expect(linked.has(key)).toBe(answered);
      }
    }
  });
});

describe('a NetworkComposer following a stage that named people', () => {
  it('asks its node form of the people already in the session', () => {
    // The canvas holds every node of the subject type, and its inspector opens
    // the node form for any of them. Treating those fields as creation-only
    // leaves everyone named earlier without the answers the composer visibly
    // collected.
    const { network } = generateNetwork({
      seed: 8,
      codebook: codebook({
        name: { name: 'Name', type: 'text' },
        role: { name: 'Role', type: 'text' },
      }),
      stages: [
        nameGenerator(),
        stage({
          id: 'composer',
          type: 'NetworkComposer',
          label: 'Compose',
          subject: { entity: 'node', type: 'person' },
          nodeForm: { fields: [{ variable: 'role', prompt: 'Their role?' }] },
        }),
      ],
    });

    expect(network.nodes.length).toBeGreaterThanOrEqual(3);
    for (const node of network.nodes) {
      expect(attributesOf(node).role).toBeDefined();
    }
  });
});

describe('a stage filtered on the edge type it creates', () => {
  it('sees the edges its predecessors made', () => {
    // Two censuses each link their own wave, then a third asks about everyone
    // who by now has a friendship. The interview answers that against the
    // edges already collected, so the third census reaches every pair; a plan
    // blind to its own type's earlier edges admits nobody there and stops at
    // the two within-wave links.
    const withWaves = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            wave: { name: 'Wave', type: 'number' },
          },
          synthetic: { count: { distribution: 'constant', value: 4 } },
        },
      },
      edge: {
        friend: {
          name: 'Friend',
          color: 'edge-color-seq-1',
          variables: {},
        },
      },
      ego: { variables: {} },
    } as unknown as Codebook;

    const wave = (id: string, value: number): Stage =>
      nameGenerator({
        id,
        prompts: [
          {
            id: `${id}-p1`,
            text: 'Who?',
            additionalAttributes: [{ variable: 'wave', value }],
          },
        ],
        behaviours: { minNodes: 2, maxNodes: 2 },
      });

    const censusFiltered = (id: string, rule: Record<string, unknown>): Stage =>
      stage({
        id,
        type: 'DyadCensus',
        synthetic: FULL_DENSITY,
        label: 'Pairs',
        subject: { entity: 'node', type: 'person' },
        prompts: [{ id: `${id}-p1`, text: 'Which?', createEdge: 'friend' }],
        filter: { join: 'AND', rules: [rule] },
      });

    const { network } = generateNetwork({
      seed: 13,
      codebook: withWaves,
      stages: [
        wave('ng-one', 1),
        censusFiltered('census-one', {
          id: 'r1',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'wave',
            operator: 'EXACTLY',
            value: 1,
          },
        }),
        wave('ng-two', 2),
        censusFiltered('census-two', {
          id: 'r2',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'wave',
            operator: 'EXACTLY',
            value: 2,
          },
        }),
        censusFiltered('census-all', {
          id: 'r3',
          type: 'edge',
          options: { type: 'friend', operator: 'EXISTS' },
        }),
      ],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(4);
    // Every pair among the four, not just the two within-wave links.
    expect(network.edges).toHaveLength(6);
  });
});

describe('a NetworkComposer’s tools over people and links already present', () => {
  const composerCodebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          name: { name: 'Name', type: 'text' },
          role: { name: 'Role', type: 'text' },
          groups: {
            name: 'Groups',
            type: 'categorical',
            options: [
              { label: 'Family', value: 'family' },
              { label: 'Work', value: 'work' },
            ],
          },
        },
        synthetic: { count: { distribution: 'constant', value: 3 } },
      },
    },
    edge: {
      friend: {
        name: 'Friend',
        color: 'edge-color-seq-1',
        variables: { since: { name: 'Since', type: 'text' } },
      },
    },
    ego: { variables: {} },
  } as unknown as Codebook;

  const composer = stage({
    id: 'composer',
    type: 'NetworkComposer',
    label: 'Compose',
    subject: { entity: 'node', type: 'person' },
    nodeForm: { fields: [{ variable: 'role', prompt: 'Their role?' }] },
    convexHullVariable: 'groups',
    edges: [
      {
        subject: { entity: 'edge', type: 'friend' },
        form: { fields: [{ variable: 'since', prompt: 'Since when?' }] },
      },
    ],
  });

  const sociogram = stage({
    id: 'sociogram',
    type: 'Sociogram',
    synthetic: FULL_DENSITY,
    label: 'Draw links',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: 's-p1',
        text: 'Who knows whom?',
        edges: { create: 'friend' },
      },
    ],
  });

  it('assigns groups to people an earlier stage introduced', () => {
    // The canvas loads every node of the subject type, and the group tool acts
    // on whatever is on it — so membership is not something only the
    // composer's own people can hold.
    const { network } = generateNetwork({
      seed: 21,
      codebook: composerCodebook,
      stages: [nameGenerator(), composer],
    });

    expect(network.nodes.length).toBeGreaterThanOrEqual(3);
    for (const node of network.nodes) {
      expect(attributesOf(node).groups).toBeDefined();
    }
  });

  it('asks its edge form of links a Sociogram drew before it', () => {
    // The inspector opens the edge form for any edge on the canvas, including
    // ones that existed before this stage ran.
    const { network } = generateNetwork({
      seed: 22,
      codebook: composerCodebook,
      stages: [nameGenerator(), sociogram, composer],
    });

    expect(network.edges.length).toBeGreaterThan(0);
    for (const edge of network.edges) {
      expect(attributesOf(edge as unknown as NcNode).since).toBeDefined();
    }
  });
});

describe('an edge retried at a stage that cannot reach its endpoints', () => {
  it('is not made there', () => {
    // Sharing an edge type is not sharing a domain. When the planned creator
    // is skipped, the retry is offered to whatever creates that type next —
    // and a creator whose filter excludes these people could not have
    // presented this edge, so it must not land it.
    const withWave = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            wave: { name: 'Wave', type: 'number' },
          },
          synthetic: { count: { distribution: 'constant', value: 4 } },
        },
      },
      edge: {
        friend: {
          name: 'Friend',
          color: 'edge-color-seq-1',
          variables: {},
        },
      },
      ego: { variables: {} },
    } as unknown as Codebook;

    const { network } = generateNetwork({
      seed: 31,
      codebook: withWave,
      stages: [
        nameGenerator({
          id: 'ng-one',
          prompts: [
            {
              id: 'ng-one-p1',
              text: 'Who?',
              additionalAttributes: [{ variable: 'wave', value: 1 }],
            },
          ],
          behaviours: { minNodes: 2, maxNodes: 2 },
        }),
        nameGenerator({
          id: 'ng-two',
          prompts: [
            {
              id: 'ng-two-p1',
              text: 'Who else?',
              additionalAttributes: [{ variable: 'wave', value: 2 }],
            },
          ],
          behaviours: { minNodes: 2, maxNodes: 2 },
        }),
        // Plans every pair, then never runs.
        stage({
          id: 'skipped',
          type: 'DyadCensus',
          synthetic: FULL_DENSITY,
          label: 'All pairs',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'sk-p1', text: 'Which?', createEdge: 'friend' }],
          skipLogic: {
            action: 'SKIP',
            filter: {
              join: 'AND',
              rules: [
                {
                  id: 'r0',
                  type: 'ego',
                  options: { attribute: 'missing', operator: 'NOT_EXISTS' },
                },
              ],
            },
          },
        }),
        // Only ever asked about wave 2, so only that pair is its to make.
        stage({
          id: 'wave-two-only',
          type: 'DyadCensus',
          synthetic: FULL_DENSITY,
          label: 'Wave two',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'w2-p1', text: 'Which?', createEdge: 'friend' }],
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'r1',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'wave',
                  operator: 'EXACTLY',
                  value: 2,
                },
              },
            ],
          },
        }),
      ],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(4);

    const waveOf = new Map(
      network.nodes.map((node) => [
        node[entityPrimaryKeyProperty],
        attributesOf(node).wave,
      ]),
    );
    // Every edge that survived is one the wave-two census could have drawn.
    for (const edge of network.edges) {
      expect(waveOf.get(edge.from)).toBe(2);
      expect(waveOf.get(edge.to)).toBe(2);
    }
  });
});

describe('a stage filtered on a value only a later stage collects', () => {
  it('does not admit subjects on an answer it has not asked for yet', () => {
    // The plan settles final values up front, so handing them to a filter
    // answers with the end of the interview rather than its middle: the census
    // here runs before anyone has been asked their role, and against the
    // finished network it would pair people on an answer that does not exist
    // when it runs.
    const withLateRole = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            name: { name: 'Name', type: 'text' },
            role: {
              name: 'Role',
              type: 'text',
              synthetic: { generator: 'occupation' },
            },
          },
          synthetic: { count: { distribution: 'constant', value: 4 } },
        },
      },
      edge: {
        friend: {
          name: 'Friend',
          color: 'edge-color-seq-1',
          variables: {},
        },
      },
      ego: { variables: {} },
    } as unknown as Codebook;

    const { network } = generateNetwork({
      seed: 41,
      codebook: withLateRole,
      stages: [
        nameGenerator({ behaviours: { minNodes: 4, maxNodes: 4 } }),
        stage({
          id: 'early-census',
          type: 'DyadCensus',
          synthetic: FULL_DENSITY,
          label: 'Pairs',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'ec-p1', text: 'Which?', createEdge: 'friend' }],
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'r1',
                type: 'node',
                options: {
                  type: 'person',
                  attribute: 'role',
                  operator: 'EXISTS',
                },
              },
            ],
          },
        }),
        alterForm('roles', 'role'),
      ],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(4);
    // Everyone ends up with a role, but nobody had one when the census ran.
    for (const node of network.nodes) {
      expect(attributesOf(node).role).toBeDefined();
    }
    expect(network.edges).toHaveLength(0);
  });
});

describe('a node generator skip logic proves unreachable', () => {
  it('is given no share of the declared population', () => {
    // Materialisation skips the stage and does not reallocate its share to a
    // later creator, so a population apportioned to an unreachable generator
    // is simply never built — the finished network sits below what the
    // codebook declares, and the values that share claimed are spent on
    // people the session never holds.
    const { network } = generateNetwork({
      seed: 17,
      codebook: codebook({ name: { name: 'Name', type: 'text' } }),
      stages: [
        nameGenerator({
          id: 'reached',
          behaviours: {},
          synthetic: { count: { distribution: 'constant', value: 3 } },
        }),
        nameGenerator({
          id: 'never-reached',
          behaviours: {},
          skipLogic: {
            action: 'SKIP',
            filter: {
              join: 'AND',
              rules: [
                {
                  id: 'r1',
                  type: 'ego',
                  options: { attribute: 'nothing', operator: 'NOT_EXISTS' },
                },
              ],
            },
          },
        }),
      ],
      respectSkipLogicAndFiltering: true,
    });

    // The codebook declares three people and one reachable generator, so all
    // three are named there rather than two of them going missing with the
    // stage that was to have named them.
    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(node.stageId).toBe('reached');
    }
  });
});

describe('an open-ended date variable with a declared window', () => {
  it('draws from the window rather than from the fallback span', () => {
    // The field declares no bounds, so the engine invents a span — roughly the
    // last decade — for an open-ended draw to land in. That stand-in is not a
    // rule, and intersecting a declared 1950–1960 with it discarded the
    // authored window as disjoint and generated recent dates instead.
    const { network } = generateNetwork({
      seed: 19,
      codebook: codebook({
        name: { name: 'Name', type: 'text' },
        born: {
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          synthetic: {
            distribution: 'uniform',
            min: '1950-01-01',
            max: '1960-01-01',
          },
        },
      }),
      stages: [nameGenerator(), alterForm('form', 'born')],
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      const born = String(attributesOf(node).born);
      expect(born >= '1950-01-01' && born <= '1960-01-01').toBe(true);
    }
  });
});

describe('a stage guarded on an ego field no reachable form collects', () => {
  it('is proven unreachable and given no population', () => {
    // An EgoForm makes possible only the fields it actually asks for. Marking
    // every ego variable as possible left this guard undecidable, so the stage
    // stayed in the plan, took part of the population, and then never ran.
    const { network } = generateNetwork({
      seed: 23,
      codebook: {
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
            asked: { name: 'Asked', type: 'text' },
            never: { name: 'Never', type: 'boolean' },
          },
        },
      } as unknown as Codebook,
      stages: [
        stage({
          id: 'ego',
          type: 'EgoForm',
          label: 'About you',
          form: { fields: [{ variable: 'asked', prompt: 'Your name?' }] },
        }),
        nameGenerator({
          id: 'reached',
          behaviours: {},
          synthetic: { count: { distribution: 'constant', value: 3 } },
        }),
        nameGenerator({
          id: 'guarded',
          behaviours: {},
          skipLogic: {
            action: 'SHOW',
            filter: {
              join: 'AND',
              rules: [
                {
                  id: 'r1',
                  type: 'ego',
                  options: { attribute: 'never', operator: 'EXISTS' },
                },
              ],
            },
          },
        }),
      ],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(node.stageId).toBe('reached');
    }
  });
});
