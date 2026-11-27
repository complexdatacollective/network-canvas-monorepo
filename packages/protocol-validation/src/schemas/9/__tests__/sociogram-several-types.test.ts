import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import { testId } from '../../../__tests__/testIds.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

type Fields = Record<string, unknown>;

// The base protocol, whose second stage is a Sociogram, showing people and
// colleagues, each with a boolean attribute (venues are not shown), with the Sociogram's prompts and
// the `knows` edge type's settings given.
const issuesOf = (prompts: Fields[], knows: Fields = {}) => {
  const base = createBaseProtocol();
  const [nameGenerator, stage] = base.stages;
  const protocol = {
    ...base,
    codebook: {
      ...base.codebook,
      node: {
        person: {
          ...base.codebook.node.person,
          variables: {
            ...base.codebook.node.person.variables,
            trusted: { name: 'Trusted', type: 'boolean' },
          },
        },
        colleague: {
          ...base.codebook.node.colleague,
          variables: {
            ...base.codebook.node.colleague.variables,
            mentor: { name: 'Mentor', type: 'boolean' },
          },
        },
        venue: {
          ...base.codebook.node.colleague,
          name: 'Venue',
          variables: {},
        },
      },
      edge: {
        ...base.codebook.edge,
        knows: { ...base.codebook.edge.knows, ...knows },
      },
    },
    stages: [
      nameGenerator,
      {
        ...stage,
        subject: { entity: 'node', types: ['person', 'colleague'] },
        prompts: prompts.map((fields, index) => ({
          id: testId(`prompt ${index}`),
          text: localized(`Prompt ${index}`),
          task: 'layout',
          ...fields,
        })),
      },
    ],
  };
  return parseIssues(ProtocolSchemaV9.safeParse(withFinishStage(protocol)));
};

const highlightEntry = (type: string, variable: string) => ({
  id: testId(`highlight ${type}`),
  type,
  variable,
});

const sortRule = (type: string, property: string) => ({
  id: testId(`sort ${type} ${property}`),
  type,
  property,
  direction: 'asc',
});

describe('a Sociogram showing several node types', () => {
  it('accepts a prompt of each task about both types', () => {
    expect(
      issuesOf([
        {
          sortOrder: [sortRule('colleague', 'colleagueName')],
          nodeTypeOrder: ['colleague', 'person'],
        },
        {
          task: 'highlight',
          highlight: [
            highlightEntry('person', 'trusted'),
            highlightEntry('colleague', 'mentor'),
          ],
        },
        { task: 'connect', edges: { create: 'knows' } },
      ]),
    ).toEqual([]);
  });

  it('rejects an unknown variable on every per-type row of a two-type Sociogram', () => {
    const entries = [
      highlightEntry('person', 'no-such-person-variable'),
      highlightEntry('colleague', 'no-such-colleague-variable'),
    ];
    const paths = issuesOf([{ task: 'highlight', highlight: entries }]).map(
      ({ path }) => path,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        'stages.1.prompts.0.highlight.0.variable',
        'stages.1.prompts.0.highlight.1.variable',
      ]),
    );
    // Each row is judged against its own type: a variable of the other type
    // is unknown there too.
    const crossed = issuesOf([
      {
        task: 'highlight',
        highlight: [
          highlightEntry('person', 'mentor'),
          highlightEntry('colleague', 'trusted'),
        ],
      },
    ]).map(({ path }) => path);
    expect(crossed).toEqual(
      expect.arrayContaining([
        'stages.1.prompts.0.highlight.0.variable',
        'stages.1.prompts.0.highlight.1.variable',
      ]),
    );
  });

  it('rejects a sort rule about a codebook type the stage does not show', () => {
    expect(
      issuesOf([{ sortOrder: [sortRule('venue', 'name')] }]),
    ).toContainEqual({
      path: 'stages.1.prompts.0.sortOrder.0.type',
      code: 'custom',
      message:
        'A sort rule is about node type "Venue", which this stage does not show.',
    });
  });

  it('rejects a node type order that is not a permutation of the stage types', () => {
    expect(issuesOf([{ nodeTypeOrder: ['person'] }])).toContainEqual({
      path: 'stages.1.prompts.0.nodeTypeOrder',
      code: 'custom',
      message: 'The node type order does not name node type "Colleague".',
    });
    expect(
      issuesOf([{ nodeTypeOrder: ['person', 'colleague', 'person'] }]),
    ).toContainEqual({
      path: 'stages.1.prompts.0.nodeTypeOrder.2',
      code: 'custom',
      message: 'The node type order names node type "Person" more than once.',
    });
    expect(
      issuesOf([{ nodeTypeOrder: ['person', 'colleague', 'venue'] }]),
    ).toContainEqual({
      path: 'stages.1.prompts.0.nodeTypeOrder.2',
      code: 'custom',
      message:
        'The node type order names node type "Venue", which this stage does not show.',
    });
    expect(issuesOf([{ nodeTypeOrder: ['person', 'colleague'] }])).toEqual([]);
  });

  it('rejects a connect task whose edge type allows no pair among the stage types', () => {
    const connect = [{ task: 'connect', edges: { create: 'knows' } }];
    const issue = {
      path: 'stages.1.prompts.0.edges.create',
      code: 'custom',
      message:
        'Edge type "Knows" allows no connection between the node types this stage shows.',
    };
    expect(
      issuesOf(connect, {
        endpointRules: [{ sourceType: 'person', targetType: 'venue' }],
        directed: true,
      }),
    ).toContainEqual(issue);
    expect(
      issuesOf(connect, {
        directed: true,
        endpointRules: [{ sourceType: 'colleague', targetType: 'person' }],
      }),
    ).not.toContainEqual(issue);
  });
});
