import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type ComponentType,
  type Stage,
  type StructuralCodebook,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork';
import { SyntheticDataConstraintError } from '../error';

const TODAY = '2026-07-27';

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

function valuesOf(
  entities: readonly {
    [entityAttributesProperty]: Record<string, VariableValue>;
  }[],
  variable: string,
): VariableValue[] {
  return entities.map((entity) => {
    const value = entity[entityAttributesProperty][variable];
    if (value === undefined) throw new Error(`no value for "${variable}"`);
    return value;
  });
}

describe('NetworkComposer field renderings', () => {
  // The defect this exists for: the codebook's own DatePicker declares no
  // bounds, so the window read from it runs back years, while the control the
  // stage actually renders admits one day. Every node the stage creates is
  // handed to that stage's own form.
  it('draws a node attribute inside the window the composer field validates', () => {
    const { network } = generateNetwork({
      codebook: codebookWith({}),
      stages: [
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
      seed: 7,
      config: { today: TODAY },
    });

    expect(network.nodes.length).toBeGreaterThan(0);
    expect(new Set(valuesOf(network.nodes, 'born'))).toEqual(
      new Set(['2020-06-15']),
    );
  });

  it('ignores rendering conflicts from composers proven unreachable', () => {
    const reachable = composerStage({
      id: 'reachable',
      nodeFields: [
        {
          variable: 'born',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-06-15', before: 0, after: 0 },
        },
      ],
    });
    const unreachable: Stage = {
      ...composerStage({
        id: 'unreachable',
        nodeFields: [
          {
            variable: 'born',
            component: 'RelativeDatePicker',
            parameters: { anchor: '2021-06-15', before: 0, after: 0 },
          },
        ],
      }),
      skipLogic: {
        action: 'SKIP',
        filter: {
          rules: [
            {
              id: 'missing-consent',
              type: 'ego',
              options: {
                attribute: asEntityAttributeReference('consent'),
                operator: 'NOT_EXISTS',
              },
            },
          ],
        },
      },
    };

    const { network } = generateNetwork({
      codebook: codebookWith({}),
      stages: [reachable, unreachable],
      seed: 7,
      config: { today: TODAY },
      respectSkipLogicAndFiltering: true,
    });

    expect(new Set(valuesOf(network.nodes, 'born'))).toEqual(
      new Set(['2020-06-15']),
    );
  });

  // An edge form's fields resolve against that edge entry's own subject, so the
  // overlay has to follow the same split rather than reading every field
  // against the stage subject.
  it('draws an edge attribute inside the window its edge form validates', () => {
    const { network } = generateNetwork({
      codebook: codebookWith({}),
      stages: [
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
      seed: 3,
      // A composer's edges are sparse by default, so every pair is drawn here
      // rather than hunting for a seed that produces one.
      config: {
        today: TODAY,
        networkComposerEdgeProbability: { min: 1, max: 1 },
      },
    });

    expect(network.edges.length).toBeGreaterThan(0);
    expect(new Set(valuesOf(network.edges, 'since'))).toEqual(
      new Set(['1990']),
    );
  });

  // The count has to read the same window the draw does, or feasibility spends
  // values the generator cannot reach. A one-day window holds one value, and
  // the stage can create more people than that.
  it('counts a unique value space against the composer window', () => {
    const generate = () =>
      generateNetwork({
        codebook: codebookWith({ nodeValidation: { unique: true } }),
        stages: [
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
        seed: 11,
        config: { today: TODAY },
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    try {
      generate();
    } catch (error) {
      if (!(error instanceof SyntheticDataConstraintError)) throw error;
      expect(error.conflicts).toHaveLength(1);
      expect(error.conflicts[0]?.variableNames).toEqual(['Born']);
      expect(error.conflicts[0]?.rules).toEqual(['unique']);
      expect(error.conflicts[0]?.reason).toContain('only 1 distinct values');
    }
  });

  // The interview reads a field's parameters as `field.parameters ??
  // codebookEntry.parameters`, so a field that changes only the control renders
  // on the codebook's parameters — read through the new control, which consults
  // none of the keys a DatePicker writes. What the participant gets is the
  // relative picker's own default window.
  it('falls back to the codebook parameters through the composer control', () => {
    const { network } = generateNetwork({
      codebook: codebookWith({
        nodeParameters: { type: 'full', min: '1990-01-01', max: '1990-12-31' },
      }),
      stages: [
        composerStage({
          nodeFields: [{ variable: 'born', component: 'RelativeDatePicker' }],
        }),
      ],
      seed: 5,
      config: { today: TODAY },
    });

    for (const value of valuesOf(network.nodes, 'born')) {
      expect(typeof value).toBe('string');
      // The RelativeDatePicker default span: 180 days back from today, none
      // forward.
      expect(String(value) >= '2026-01-28').toBe(true);
      expect(String(value) <= TODAY).toBe(true);
    }
  });

  // Only the two date pickers bound a value: `buildDatePickerBoundProps`
  // returns nothing for any other control, so a composer rendering a date
  // variable as text adds no bound and the codebook's window is still the one
  // the value has to satisfy.
  it('keeps the codebook window where the composer renders no date control', () => {
    const { network } = generateNetwork({
      codebook: codebookWith({
        nodeParameters: { type: 'year', min: '1990', max: '1990' },
      }),
      stages: [
        composerStage({
          nodeFields: [{ variable: 'born', component: 'Text' }],
        }),
      ],
      seed: 5,
      config: { today: TODAY },
    });

    expect(new Set(valuesOf(network.nodes, 'born'))).toEqual(new Set(['1990']));
  });

  it('refuses disjoint ordinary-form and composer date windows', () => {
    const generate = () =>
      generateNetwork({
        codebook: codebookWith({
          nodeParameters: {
            type: 'full',
            min: '2000-01-01',
            max: '2010-12-31',
          },
        }),
        stages: [
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
        seed: 5,
        config: { today: TODAY },
      });

    expect(generate).toThrow(
      'this protocol renders one variable with incompatible date controls',
    );
  });

  it('ignores an ordinary form proven unreachable when resolving composer controls', () => {
    const unreachableOrdinaryForm: Stage = {
      ...alterFormStage('born'),
      skipLogic: {
        action: 'SKIP',
        filter: {
          rules: [
            {
              id: 'missing-consent',
              type: 'ego',
              options: {
                attribute: asEntityAttributeReference('consent'),
                operator: 'NOT_EXISTS',
              },
            },
          ],
        },
      },
    };
    const { network } = generateNetwork({
      codebook: codebookWith({
        nodeParameters: {
          type: 'full',
          min: '2000-01-01',
          max: '2010-12-31',
        },
      }),
      stages: [
        unreachableOrdinaryForm,
        composerStage({
          nodeFields: [
            {
              variable: 'born',
              component: 'DatePicker',
              parameters: {
                type: 'full',
                min: '2020-01-01',
                max: '2020-01-01',
              },
            },
          ],
        }),
      ],
      seed: 5,
      config: { today: TODAY },
      respectSkipLogicAndFiltering: true,
    });

    expect(new Set(valuesOf(network.nodes, 'born'))).toEqual(
      new Set(['2020-01-01']),
    );
  });

  it('intersects an ordinary Boolean field with a composer Toggle override', () => {
    const values = new Set<VariableValue>();

    for (let seed = 0; seed < 20; seed++) {
      const { network } = generateNetwork({
        codebook: codebookWith({
          booleanOptions: [{ label: 'Yes', value: true }],
        }),
        stages: [
          alterFormStage('flag'),
          composerStage({
            nodeFields: [{ variable: 'flag', component: 'Toggle' }],
          }),
        ],
        seed,
        config: { today: TODAY },
      });
      for (const value of valuesOf(network.nodes, 'flag')) values.add(value);
    }

    expect(values).toEqual(new Set([true]));
  });

  // One stored value reaches every stage that renders it — a composer's canvas
  // lists every node of its subject type, whoever created it — so two stages
  // rendering one variable through disjoint windows is a contradiction, not a
  // choice to make quietly.
  it('refuses two composer stages that render one variable differently', () => {
    const generate = () =>
      generateNetwork({
        codebook: codebookWith({}),
        stages: [
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
        seed: 11,
        config: { today: TODAY },
      });

    expect(generate).toThrow(
      'this protocol renders one variable with incompatible date controls',
    );
    try {
      generate();
    } catch (error) {
      if (!(error instanceof SyntheticDataConstraintError)) throw error;
      expect(error.conflicts).toHaveLength(1);
      expect(error.conflicts[0]?.entity).toBe('node');
      expect(error.conflicts[0]?.entityTypeName).toBe('Person');
      expect(error.conflicts[0]?.variableNames).toEqual(['Born']);
    }
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

    const { network } = generateNetwork({
      codebook: codebookWith({}),
      stages: [
        composerStage({ id: 'composer-1', nodeFields: [field] }),
        composerStage({ id: 'composer-2', nodeFields: [field] }),
      ],
      seed: 11,
      config: { today: TODAY },
    });

    expect(new Set(valuesOf(network.nodes, 'born'))).toEqual(
      new Set(['2020-06-15']),
    );
  });

  it('intersects overlapping composer date windows at the same resolution', () => {
    const { network } = generateNetwork({
      codebook: codebookWith({}),
      stages: [
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
      seed: 11,
      config: { today: TODAY },
    });

    for (const value of valuesOf(network.nodes, 'born')) {
      expect(String(value) >= '2010-01-01').toBe(true);
      expect(String(value) <= '2020-12-31').toBe(true);
    }
  });

  it('draws only the values offered by a Boolean choice control', () => {
    const { network } = generateNetwork({
      codebook: codebookWith({
        booleanOptions: [{ label: 'Yes', value: true }],
      }),
      stages: [composerStage({})],
      seed: 7,
      config: { today: TODAY },
    });

    expect(new Set(valuesOf(network.nodes, 'flag'))).toEqual(new Set([true]));
  });

  it('uses the full Boolean pair when a composer overrides the choice control with Toggle', () => {
    const values = new Set<VariableValue>();

    for (let seed = 0; seed < 20; seed++) {
      const { network } = generateNetwork({
        codebook: codebookWith({
          booleanOptions: [{ label: 'Yes', value: true }],
        }),
        stages: [
          composerStage({
            nodeFields: [{ variable: 'flag', component: 'Toggle' }],
          }),
        ],
        seed,
        config: { today: TODAY },
      });
      for (const value of valuesOf(network.nodes, 'flag')) values.add(value);
    }

    expect(values).toEqual(new Set([false, true]));
  });

  it('counts Boolean choices when checking unique feasibility', () => {
    const generate = () =>
      generateNetwork({
        codebook: codebookWith({
          booleanOptions: [{ label: 'Yes', value: true }],
          booleanValidation: { unique: true },
        }),
        stages: [composerStage({})],
        seed: 7,
        config: { today: TODAY },
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow('only 1 distinct values');
  });
});
