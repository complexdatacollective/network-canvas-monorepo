import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import { testId } from '../../../__tests__/testIds.ts';
import { createBaseProtocol, localized } from '../../../utils/test-utils.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

// The base protocol, whose second stage is a Sociogram of people, with a
// boolean attribute on people, and its Sociogram's settings changed by
// `sociogram`.
const issuesOf = (sociogram: Record<string, unknown>) => {
  const base = createBaseProtocol();
  const [nameGenerator, stage] = base.stages;
  const protocol = {
    ...base,
    codebook: {
      ...base.codebook,
      node: {
        ...base.codebook.node,
        person: {
          ...base.codebook.node.person,
          variables: {
            ...base.codebook.node.person.variables,
            trusted: { name: 'Trusted', type: 'boolean' },
          },
        },
      },
    },
    stages: [nameGenerator, { ...stage, ...sociogram }],
  };
  return parseIssues(ProtocolSchemaV9.safeParse(withFinishStage(protocol)));
};

const prompt = (fields: Record<string, unknown>) => ({
  prompts: [
    {
      id: testId('task'),
      text: localized('Who do you trust?'),
      ...fields,
    },
  ],
});

const entry = (type: string, variable: string) => ({
  id: testId(`highlight-${type}`),
  type,
  variable,
});

describe('Sociogram prompt tasks', () => {
  it('accepts one prompt of each task', () => {
    expect(
      issuesOf({
        prompts: [
          {
            id: testId('layout'),
            task: 'layout',
            text: localized('Place people'),
            edges: { display: ['knows'] },
          },
          {
            id: testId('highlight'),
            task: 'highlight',
            text: localized('Tap the people you trust'),
            highlight: [entry('person', 'trusted')],
          },
          {
            id: testId('connect'),
            task: 'connect',
            text: localized('Link people who know each other'),
            edges: { create: 'knows', display: ['knows'] },
          },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects a prompt without a task', () => {
    expect(issuesOf(prompt({}))).toEqual([
      { path: 'stages.1.prompts.0.task', code: 'invalid_union' },
    ]);
  });

  it('rejects a highlight task without entries', () => {
    expect(issuesOf(prompt({ task: 'highlight', highlight: [] }))).toEqual([
      { path: 'stages.1.prompts.0.highlight', code: 'too_small' },
    ]);
    expect(issuesOf(prompt({ task: 'highlight' }))).toEqual([
      { path: 'stages.1.prompts.0.highlight', code: 'invalid_type' },
    ]);
  });

  it('rejects a connect task without edges.create', () => {
    expect(
      issuesOf(prompt({ task: 'connect', edges: { display: ['knows'] } })),
    ).toEqual([
      { path: 'stages.1.prompts.0.edges.create', code: 'invalid_type' },
    ]);
  });

  it('rejects edges.create on a layout task', () => {
    expect(
      issuesOf(prompt({ task: 'layout', edges: { create: 'knows' } })),
    ).toEqual([
      {
        path: 'stages.1.prompts.0.edges',
        code: 'unrecognized_keys',
        keys: ['create'],
      },
    ]);
  });

  it('rejects a highlight entry for a type not on the stage', () => {
    expect(
      issuesOf(
        prompt({
          task: 'highlight',
          highlight: [entry('colleague', 'colleagueName')],
        }),
      ),
    ).toContainEqual({
      path: 'stages.1.prompts.0.highlight.0.type',
      code: 'custom',
      message:
        'A highlight entry is about node type "Colleague", which this stage does not show.',
    });
  });

  it('rejects two highlight entries for one type', () => {
    expect(
      issuesOf(
        prompt({
          task: 'highlight',
          highlight: [
            entry('person', 'trusted'),
            { ...entry('person', 'trusted'), id: testId('second') },
          ],
        }),
      ),
    ).toEqual([
      {
        path: 'stages.1.prompts.0.highlight.1.type',
        code: 'custom',
        message: 'A prompt highlights node type "Person" more than once.',
      },
    ]);
  });

  it('rejects a non-boolean highlight variable', () => {
    const issues = issuesOf(
      prompt({ task: 'highlight', highlight: [entry('person', 'age')] }),
    );
    expect(issues.map(({ path }) => path)).toEqual([
      'stages.1.prompts.0.highlight.0.variable',
    ]);
  });

  it('rejects allowRepositioning on a Sociogram', () => {
    expect(issuesOf({ behaviours: { allowRepositioning: true } })).toEqual([
      {
        path: 'stages.1.behaviours',
        code: 'unrecognized_keys',
        keys: ['allowRepositioning'],
      },
    ]);
  });
});
