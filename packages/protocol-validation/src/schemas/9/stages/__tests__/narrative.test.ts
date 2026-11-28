import { describe, expect, it } from 'vitest';

import { withFinishStage } from '../../../../__tests__/finishStage.ts';
import { parseIssues } from '../../../../__tests__/schemaIssues.ts';
import { testId } from '../../../../__tests__/testIds.ts';
import { findVariableRoleConflicts } from '../../../../utils/findVariableRoleConflicts.ts';
import { createBaseProtocol, localized } from '../../../../utils/test-utils.ts';
import { ProtocolSchemaV9 } from '../../schema.ts';
import { narrativeStage } from '../narrative.ts';

const nameRule = {
  type: 'node' as const,
  id: testId('rule-name'),
  options: {
    type: 'person',
    attribute: 'name',
    operator: 'EXACTLY',
    value: 'Alice',
  },
};

const preset = (id: string, settings: Record<string, unknown> = {}) => ({
  id: testId(id),
  label: localized(id),
  layout: 'layoutPosition',
  ...settings,
});

const stageWith = (settings: Record<string, unknown>) => ({
  id: testId('narrative'),
  label: localized('Narrative'),
  type: 'Narrative' as const,
  subject: { entity: 'node' as const, types: ['person'] },
  background: { concentricCircles: 4 },
  presets: [preset('first'), preset('second')],
  ...settings,
});

// The base protocol, with a Boolean attribute on each node type, and one
// Narrative stage after its own stages.
const protocolWith = (
  settings: Record<string, unknown>,
  stagesBefore: Record<string, unknown>[] = [],
) => {
  const base = createBaseProtocol();
  const { person, colleague } = base.codebook.node;
  return withFinishStage({
    ...base,
    codebook: {
      ...base.codebook,
      node: {
        person: {
          ...person,
          variables: {
            ...person.variables,
            close: { name: 'Close', type: 'boolean', component: 'Boolean' },
          },
        },
        colleague: {
          ...colleague,
          variables: {
            ...colleague.variables,
            senior: { name: 'Senior', type: 'boolean' },
          },
        },
      },
    },
    stages: [...base.stages, ...stagesBefore, stageWith(settings)],
  });
};

const narrativeIssues = (settings: Record<string, unknown>) => {
  const protocol = protocolWith(settings);
  const at = protocol.stages.findIndex(
    (stage) => stage.id === testId('narrative'),
  );
  return parseIssues(ProtocolSchemaV9.safeParse(protocol)).filter(({ path }) =>
    path.startsWith(`stages.${at}.`),
  );
};

describe('the filter of a Narrative preset', () => {
  it('is accepted on any preset, and differently on each', () => {
    expect(
      narrativeIssues({
        presets: [
          preset('first', { filter: { rules: [nameRule] } }),
          preset('second', {
            filter: {
              join: 'OR',
              rules: [
                { ...nameRule, id: testId('rule-second') },
                { ...nameRule, id: testId('rule-other') },
              ],
            },
          }),
          preset('third'),
        ],
      }),
    ).toEqual([]);
  });

  it('is refused on the stage itself', () => {
    expect(
      parseIssues(
        narrativeStage.safeParse(stageWith({ filter: { rules: [nameRule] } })),
      ),
    ).toEqual([{ path: '', code: 'unrecognized_keys', keys: ['filter'] }]);
  });

  it('is held to the codebook, at the preset that holds it', () => {
    const issues = narrativeIssues({
      presets: [
        preset('first'),
        preset('second', {
          filter: {
            rules: [
              {
                ...nameRule,
                options: { ...nameRule.options, attribute: 'missing' },
              },
            ],
          },
        }),
      ],
    });

    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every(({ path }) => path.includes('.presets.1.filter.rules.0')),
    ).toBe(true);
  });

  it('cannot ask about the participant, as a stage filter cannot', () => {
    const issues = narrativeIssues({
      presets: [
        preset('first', {
          filter: {
            rules: [
              {
                type: 'ego',
                id: testId('rule-ego'),
                options: { attribute: 'egoName', operator: 'EXISTS' },
              },
            ],
          },
        }),
        preset('second'),
      ],
    });

    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every(({ path }) => path.includes('.presets.0.filter.rules.0')),
    ).toBe(true);
  });

  it('cannot repeat a rule id', () => {
    const issues = narrativeIssues({
      presets: [
        preset('first', {
          filter: { join: 'AND', rules: [nameRule, nameRule] },
        }),
        preset('second'),
      ],
    });

    expect(
      issues.map(({ path }) => path.replace(/^stages\.\d+\./, '')),
    ).toEqual(['presets.0.filter.rules.0.id', 'presets.0.filter.rules.1.id']);
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'custom',
        message: expect.stringContaining(
          `The id "${testId('rule-name')}" is also used in this stage at`,
        ),
      }),
      expect.objectContaining({ code: 'custom' }),
    ]);
  });

  it('cannot repeat a rule id another preset uses', () => {
    const issues = narrativeIssues({
      presets: [
        preset('first', { filter: { rules: [nameRule] } }),
        preset('second', { filter: { rules: [nameRule] } }),
      ],
    });

    expect(
      issues.map(({ path }) => path.replace(/^stages\.\d+\./, '')),
    ).toEqual(['presets.0.filter.rules.0.id', 'presets.1.filter.rules.0.id']);
    expect(
      issues.every(({ message }) =>
        message?.endsWith('Every id in a protocol must be unique.'),
      ),
    ).toBe(true);
  });
});

const TWO_TYPES = { entity: 'node' as const, types: ['person', 'colleague'] };

const highlightEntry = (attributes: { type: string; variable: string }[]) => ({
  id: testId('highlight-entry'),
  label: localized('Close'),
  attributes: attributes.map((attribute, index) => ({
    id: testId(`highlight-attribute-${index}`),
    ...attribute,
  })),
});

const issuePaths = (settings: Record<string, unknown>) =>
  narrativeIssues(settings).map(({ path }) =>
    path.replace(/^stages\.\d+\./, ''),
  );

describe('the groups of a Narrative preset', () => {
  it('rejects groupVariable with two node types', () => {
    const presets = [
      preset('first', { groupVariable: 'category' }),
      preset('second'),
    ];

    expect(issuePaths({ presets })).toEqual([]);
    expect(issuePaths({ subject: TWO_TYPES, presets })).toEqual([
      'presets.0.groupVariable',
    ]);
  });
});

describe('the highlights of a Narrative preset', () => {
  it('accepts one attribute for each node type of the stage', () => {
    expect(
      issuePaths({
        subject: TWO_TYPES,
        presets: [
          preset('first', {
            highlight: [
              highlightEntry([
                { type: 'person', variable: 'close' },
                { type: 'colleague', variable: 'senior' },
              ]),
            ],
          }),
        ],
      }),
    ).toEqual([]);
  });

  it('rejects a highlight entry with no attributes', () => {
    expect(
      issuePaths({
        presets: [preset('first', { highlight: [highlightEntry([])] })],
      }),
    ).toEqual(['presets.0.highlight.0.attributes']);
  });

  it('rejects an unknown variable on every per-type row of a two-type Narrative', () => {
    expect(
      issuePaths({
        subject: TWO_TYPES,
        presets: [
          preset('first', {
            highlight: [
              highlightEntry([
                { type: 'person', variable: 'senior' },
                { type: 'colleague', variable: 'close' },
              ]),
            ],
          }),
        ],
      }),
    ).toEqual([
      'presets.0.highlight.0.attributes.0.variable',
      'presets.0.highlight.0.attributes.1.variable',
    ]);
  });

  it('rejects an attribute about a type the stage does not show, or a type named twice', () => {
    expect(
      issuePaths({
        presets: [
          preset('first', {
            highlight: [
              highlightEntry([
                { type: 'person', variable: 'close' },
                { type: 'person', variable: 'close' },
                { type: 'colleague', variable: 'senior' },
              ]),
            ],
          }),
        ],
      }),
    ).toEqual([
      'presets.0.highlight.0.attributes.1.type',
      'presets.0.highlight.0.attributes.2.type',
    ]);
  });

  it('a boolean set by a form and highlighted by a Narrative is not a role conflict', () => {
    const alterForm = {
      id: testId('alter-form'),
      type: 'AlterForm',
      label: localized('About each person'),
      subject: { entity: 'node', types: ['person'] },
      form: {
        fields: [
          {
            id: testId('field-close'),
            variable: 'close',
            prompt: localized('Are you close?'),
          },
        ],
      },
    };
    const protocol = protocolWith(
      {
        presets: [
          preset('first', {
            highlight: [
              highlightEntry([{ type: 'person', variable: 'close' }]),
            ],
          }),
        ],
      },
      [alterForm],
    );

    expect(ProtocolSchemaV9.safeParse(protocol).success).toBe(true);
    expect(findVariableRoleConflicts(protocol)).toEqual([]);
  });
});
