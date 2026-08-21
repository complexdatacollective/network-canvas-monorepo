import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type ComponentType,
  DEFAULT_EDGE_TOPOLOGY,
  DEFAULT_NODE_COUNT,
  DEFAULT_RESPONSE_BURDEN,
  type Stage,
  type StructuralCodebook,
  type Variable,
} from '@codaco/protocol-validation';

import { buildVariableConstraints } from '../buildConstraints';
import {
  applyComposerRenderings,
  COMPOSER_RENDERING_CONFLICT,
} from '../composerRenderings';
import { toVariableEntry } from '../variableEntry';

const TODAY = '2026-07-27';

/**
 * The overlay itself, unit-tested: which control domain each variable ends up
 * generated against, and which combinations are reported as conflicts. The
 * engine-integration half — that the NetworkComposer simulator actually draws
 * inside these windows and refuses these conflicts — lives with its C4 suite
 * (`simulators/__tests__/NetworkComposer.test.ts`, "the composer rendering
 * overlay"), which drives `generateInterviews` end to end.
 */

type DatePickerParameters = {
  type?: 'full' | 'month' | 'year';
  min?: string;
  max?: string;
};

type ComposerField = {
  variable: string;
  component: ComponentType;
  parameters?: Record<string, unknown>;
};

function codebookWith(options: {
  nodeParameters?: DatePickerParameters;
  nodeValidation?: { unique?: boolean };
  booleanComponent?: 'Boolean' | 'Toggle';
  booleanOptions?: { label: string; value: boolean }[];
  booleanValidation?: { unique?: boolean };
}): StructuralCodebook {
  return {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          name: { name: 'Name', type: 'text', component: 'Text' },
          layout: { name: 'Layout', type: 'layout' },
          born: {
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            ...(options.nodeParameters !== undefined
              ? { parameters: options.nodeParameters }
              : {}),
            ...(options.nodeValidation !== undefined
              ? { validation: options.nodeValidation }
              : {}),
          },
          flag: {
            name: 'Flag',
            type: 'boolean',
            component: options.booleanComponent ?? 'Boolean',
            ...(options.booleanOptions !== undefined
              ? { options: options.booleanOptions }
              : {}),
            ...(options.booleanValidation !== undefined
              ? { validation: options.booleanValidation }
              : {}),
          },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          since: { name: 'Since', type: 'datetime', component: 'DatePicker' },
        },
      },
    },
  };
}

function referencedField(field: ComposerField) {
  return { ...field, variable: asEntityAttributeReference(field.variable) };
}

function composerStage(options: {
  id?: string;
  nodeFields?: ComposerField[];
  edgeFields?: ComposerField[];
}): Stage {
  return {
    id: options.id ?? 'composer-1',
    type: 'NetworkComposer',
    // Schema-injected generation metadata: a parsed stage always carries
    // it, and nothing in this test reads it.
    synthetic: {
      generatesData: true,
      responseBurden: DEFAULT_RESPONSE_BURDEN.NetworkComposer,
      count: DEFAULT_NODE_COUNT,
      topology: DEFAULT_EDGE_TOPOLOGY,
    },
    label: 'Compose',
    subject: { entity: 'node', type: 'person' },
    quickAdd: asEntityAttributeReference('name'),
    layoutVariable: asEntityAttributeReference('layout'),
    background: { concentricCircles: 1 },
    ...(options.nodeFields !== undefined
      ? { nodeForm: { fields: options.nodeFields.map(referencedField) } }
      : {}),
    edges: [
      {
        id: 'edge-def-1',
        subject: { entity: 'edge', type: 'knows' },
        ...(options.edgeFields !== undefined
          ? { form: { fields: options.edgeFields.map(referencedField) } }
          : {}),
      },
    ],
  };
}

function alterFormStage(variable: string): Stage {
  return {
    id: 'ordinary-form',
    type: 'AlterForm',
    synthetic: {
      generatesData: true,
      responseBurden: DEFAULT_RESPONSE_BURDEN.AlterForm,
    },
    label: 'Edit person',
    subject: { entity: 'node', type: 'person' },
    introductionPanel: { title: 'Introduction', text: 'Continue' },
    form: {
      fields: [
        {
          variable: asEntityAttributeReference(variable),
          prompt: 'Enter a value',
        },
      ],
    },
  };
}

function renderedNodeVariable(
  codebook: StructuralCodebook,
  stages: Stage[],
  variable: string,
): Variable {
  const { codebook: rendered, conflicts } = applyComposerRenderings(
    codebook,
    stages,
    TODAY,
  );
  expect(conflicts).toEqual([]);
  const definition = rendered.node?.person?.variables?.[variable];
  if (definition === undefined) throw new Error(`no variable "${variable}"`);
  return definition;
}

function windowOf(variable: Variable, id: string) {
  return buildVariableConstraints(toVariableEntry(id, variable), TODAY)
    .dateWindow;
}

describe('NetworkComposer field renderings', () => {
  // The defect this exists for: the codebook's own DatePicker declares no
  // bounds, so the window read from it runs back years, while the control the
  // stage actually renders admits one day. Every node the stage creates is
  // handed to that stage's own form.
  it('narrows a node variable to the window the composer field validates', () => {
    const born = renderedNodeVariable(
      codebookWith({}),
      [
        composerStage({
          nodeFields: [
            {
              variable: 'born',
              component: 'RelativeDatePicker',
              parameters: { anchor: '2020-06-15', before: 0, after: 0 },
            },
          ],
        }),
      ],
      'born',
    );

    expect(windowOf(born, 'born')).toEqual({
      resolution: 'full',
      min: '2020-06-15',
      max: '2020-06-15',
    });
  });

  // An edge form's fields resolve against that edge entry's own subject, so the
  // overlay has to follow the same split rather than reading every field
  // against the stage subject.
  it('narrows an edge variable to the window its edge form validates', () => {
    const { codebook: rendered, conflicts } = applyComposerRenderings(
      codebookWith({}),
      [
        composerStage({
          edgeFields: [
            {
              variable: 'since',
              component: 'DatePicker',
              parameters: { type: 'year', min: '1990', max: '1990' },
            },
          ],
        }),
      ],
      TODAY,
    );

    expect(conflicts).toEqual([]);
    const since = rendered.edge?.knows?.variables?.since;
    if (since === undefined) throw new Error('no variable "since"');
    expect(windowOf(since, 'since')).toEqual({
      resolution: 'year',
      min: '1990',
      max: '1990',
    });
    // The node subject's own date variable is untouched by an edge form.
    expect(rendered.node?.person?.variables?.born).toEqual(
      codebookWith({}).node?.person?.variables?.born,
    );
  });

  // The interview reads a field's parameters as `field.parameters ??
  // codebookEntry.parameters`, so a field that changes only the control renders
  // on the codebook's parameters — read through the new control, which consults
  // none of the keys a DatePicker writes. What the participant gets is the
  // relative picker's own default window: 180 days back from today, none
  // forward.
  it('falls back to the codebook parameters through the composer control', () => {
    const born = renderedNodeVariable(
      codebookWith({
        nodeParameters: { type: 'full', min: '1990-01-01', max: '1990-12-31' },
      }),
      [
        composerStage({
          nodeFields: [{ variable: 'born', component: 'RelativeDatePicker' }],
        }),
      ],
      'born',
    );

    expect(windowOf(born, 'born')).toEqual({
      resolution: 'full',
      min: '2026-01-28',
      max: TODAY,
    });
  });

  // Only the two date pickers bound a value: a composer rendering a date
  // variable as text adds no bound, so the codebook's window is still the one
  // the value has to satisfy.
  it('keeps the codebook window where the composer renders no date control', () => {
    const codebook = codebookWith({
      nodeParameters: { type: 'year', min: '1990', max: '1990' },
    });
    const born = renderedNodeVariable(
      codebook,
      [
        composerStage({
          nodeFields: [{ variable: 'born', component: 'Text' }],
        }),
      ],
      'born',
    );

    expect(born).toEqual(codebook.node?.person?.variables?.born);
    expect(windowOf(born, 'born')).toEqual({
      resolution: 'year',
      min: '1990',
      max: '1990',
    });
  });

  it('reports disjoint ordinary-form and composer date windows as a conflict', () => {
    const { conflicts } = applyComposerRenderings(
      codebookWith({
        nodeParameters: {
          type: 'full',
          min: '2000-01-01',
          max: '2010-12-31',
        },
      }),
      [
        alterFormStage('born'),
        composerStage({
          nodeFields: [
            {
              variable: 'born',
              component: 'DatePicker',
              parameters: {
                type: 'full',
                min: '2020-01-01',
                max: '2030-12-31',
              },
            },
          ],
        }),
      ],
      TODAY,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.variableNames).toEqual(['Born']);
    expect(conflicts[0]?.reason).toBe(COMPOSER_RENDERING_CONFLICT.reason);
  });

  it('folds an ordinary Boolean field with a composer Toggle override to the choice control', () => {
    const flag = renderedNodeVariable(
      codebookWith({ booleanOptions: [{ label: 'Yes', value: true }] }),
      [
        alterFormStage('flag'),
        composerStage({
          nodeFields: [{ variable: 'flag', component: 'Toggle' }],
        }),
      ],
      'flag',
    );

    // A Toggle always offers both values, so the Boolean choice control is the
    // tighter domain and wins the merge; its options still offer only `true`.
    expect('component' in flag && flag.component).toBe('Boolean');
    expect('options' in flag && flag.options).toEqual([
      { label: 'Yes', value: true },
    ]);
  });

  // One stored value reaches every stage that renders it — a composer's canvas
  // lists every node of its subject type, whoever created it — so two stages
  // rendering one variable through disjoint windows is a contradiction, not a
  // choice to make quietly.
  it('reports two composer stages that render one variable differently', () => {
    const { conflicts } = applyComposerRenderings(
      codebookWith({}),
      [
        composerStage({
          id: 'composer-1',
          nodeFields: [
            {
              variable: 'born',
              component: 'RelativeDatePicker',
              parameters: { anchor: '2020-06-15', before: 0, after: 0 },
            },
          ],
        }),
        composerStage({
          id: 'composer-2',
          nodeFields: [
            {
              variable: 'born',
              component: 'RelativeDatePicker',
              parameters: { anchor: '2010-06-15', before: 0, after: 0 },
            },
          ],
        }),
      ],
      TODAY,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.entity).toBe('node');
    expect(conflicts[0]?.entityTypeName).toBe('Person');
    expect(conflicts[0]?.variableNames).toEqual(['Born']);
  });

  // The other direction: two stages agreeing is the ordinary way to edit one
  // attribute twice, and refusing it would refuse a protocol nothing is wrong
  // with.
  it('accepts two composer stages that render one variable alike', () => {
    const field: ComposerField = {
      variable: 'born',
      component: 'RelativeDatePicker',
      parameters: { anchor: '2020-06-15', before: 0, after: 0 },
    };

    const born = renderedNodeVariable(
      codebookWith({}),
      [
        composerStage({ id: 'composer-1', nodeFields: [field] }),
        composerStage({ id: 'composer-2', nodeFields: [field] }),
      ],
      'born',
    );

    expect(windowOf(born, 'born')).toEqual({
      resolution: 'full',
      min: '2020-06-15',
      max: '2020-06-15',
    });
  });

  it('intersects overlapping composer date windows at the same resolution', () => {
    const born = renderedNodeVariable(
      codebookWith({}),
      [
        composerStage({
          id: 'composer-1',
          nodeFields: [
            {
              variable: 'born',
              component: 'DatePicker',
              parameters: {
                type: 'full',
                min: '2000-01-01',
                max: '2020-12-31',
              },
            },
          ],
        }),
        composerStage({
          id: 'composer-2',
          nodeFields: [
            {
              variable: 'born',
              component: 'DatePicker',
              parameters: {
                type: 'full',
                min: '2010-01-01',
                max: '2030-12-31',
              },
            },
          ],
        }),
      ],
      'born',
    );

    expect(windowOf(born, 'born')).toEqual({
      resolution: 'full',
      min: '2010-01-01',
      max: '2020-12-31',
    });
  });

  it('keeps a Boolean choice control and its offered options', () => {
    const flag = renderedNodeVariable(
      codebookWith({ booleanOptions: [{ label: 'Yes', value: true }] }),
      [
        composerStage({
          nodeFields: [{ variable: 'flag', component: 'Boolean' }],
        }),
      ],
      'flag',
    );

    expect('component' in flag && flag.component).toBe('Boolean');
    expect('options' in flag && flag.options).toEqual([
      { label: 'Yes', value: true },
    ]);
  });

  it('renders the full Boolean pair when a composer overrides the choice control with Toggle', () => {
    const flag = renderedNodeVariable(
      codebookWith({ booleanOptions: [{ label: 'Yes', value: true }] }),
      [
        composerStage({
          nodeFields: [{ variable: 'flag', component: 'Toggle' }],
        }),
      ],
      'flag',
    );

    // The rendered control is the Toggle, whose domain is always both values
    // whatever the choice options offered — which is what the draw reads.
    expect('component' in flag && flag.component).toBe('Toggle');
  });
});
