import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';
import { ComponentTypes } from '../variables/types.ts';

const baseStage = {
  id: 'nc1',
  label: 'Build the network',
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
  background: { concentricCircles: 4 },
  nodeForm: {
    fields: [
      { variable: 'age', component: ComponentTypes.Number, label: 'Age?' },
    ],
  },
  edges: [
    {
      id: 'edge-1',
      subject: { entity: 'edge', type: 'knows' },
      form: {
        fields: [
          {
            // `closeness` is an ordinal variable, so its control must be one
            // ordinal can render (thirteenth-wave Finding 3); this fixture
            // previously paired it with a VisualAnalogScale.
            variable: 'closeness',
            component: ComponentTypes.RadioGroup,
            label: 'How close?',
          },
        ],
      },
    },
  ],
};

const composerProtocol = (stage: Record<string, unknown>) => ({
  ...createBaseProtocol(),
  stages: [stage],
});

describe('NetworkComposer cross-reference validation', () => {
  it('accepts a stage whose references all exist (control)', () => {
    const result = ProtocolSchemaV8.safeParse(composerProtocol(baseStage));
    expect(result.success).toBe(true);
  });

  it('rejects a quickAdd referencing a missing node variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({ ...baseStage, quickAdd: 'missing' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a layoutVariable referencing a missing node variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({ ...baseStage, layoutVariable: 'missing' }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a node form field referencing a missing node variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'missing',
              component: ComponentTypes.Number,
              label: 'x',
            },
          ],
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an edge form field referencing a variable not on that edge type', () => {
    // `age` exists on the person node but NOT on the `knows` edge. If the edge
    // form resolved against the node subject this would wrongly pass.
    const result = ProtocolSchemaV8.safeParse(
      composerProtocol({
        ...baseStage,
        edges: [
          {
            id: 'edge-1',
            subject: { entity: 'edge', type: 'knows' },
            form: {
              fields: [
                {
                  variable: 'age',
                  component: ComponentTypes.Number,
                  label: 'x',
                },
              ],
            },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe('NetworkComposer stage-effective overlay resolution (seventh-wave Finding 2)', () => {
  // The codebook variables themselves are resolution-consistent (both default
  // to full resolution — neither carries its own DatePicker `parameters`), so
  // the per-subject codebook contradiction check has nothing to flag. Only a
  // STAGE field's own overlay can desynchronise them.
  const composerProtocolWithDatetimes = (stage: Record<string, unknown>) => {
    const base = createBaseProtocol();
    return {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...base.codebook.node.person,
            variables: {
              ...base.codebook.node.person.variables,
              event_a: {
                name: 'EventA',
                type: 'datetime',
                validation: { sameAs: 'event_b' },
              },
              event_b: { name: 'EventB', type: 'datetime' },
            },
          },
        },
        edge: {
          ...base.codebook.edge,
          knows: {
            ...base.codebook.edge.knows,
            variables: {
              ...base.codebook.edge.knows.variables,
              edge_event_a: {
                name: 'EdgeEventA',
                type: 'datetime',
                validation: { sameAs: 'edge_event_b' },
              },
              edge_event_b: { name: 'EdgeEventB', type: 'datetime' },
            },
          },
        },
      },
      stages: [stage],
    };
  };

  it('rejects a nodeForm field overlay that desyncs a sameAs-joined datetime group, anchored at the field', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.DatePicker,
              parameters: { type: 'year' },
            },
          ],
        },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'parameters',
    ]);
  });

  it('rejects an edge form field overlay that desyncs a sameAs-joined datetime group, anchored at the field', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithDatetimes({
        ...baseStage,
        edges: [
          {
            id: 'edge-1',
            subject: { entity: 'edge', type: 'knows' },
            form: {
              fields: [
                {
                  variable: 'edge_event_a',
                  component: ComponentTypes.DatePicker,
                  parameters: { type: 'month' },
                },
              ],
            },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'edges',
      0,
      'form',
      'fields',
      0,
      'parameters',
    ]);
  });

  it('accepts a resolution-consistent overlay across both sameAs-joined fields', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.DatePicker,
              parameters: { type: 'year' },
            },
            {
              variable: 'event_b',
              component: ComponentTypes.DatePicker,
              parameters: { type: 'year' },
            },
          ],
        },
      }),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  it('accepts an overlay that only touches one field when it matches the codebook default', () => {
    // event_b keeps the codebook default (full resolution, no override).
    // event_a's field overlay ALSO renders at full resolution (no `type`
    // set), so nothing has desynced.
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            { variable: 'event_a', component: ComponentTypes.DatePicker },
          ],
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  // Ninth-wave Finding 2: the codebook's own sameAs group is uniformly
  // year-resolution here (both event_a/event_b carry `parameters: { type:
  // 'year' }`), satisfying the per-subject codebook check on its own — only
  // a field OVERRIDE to full resolution desyncs the group. The previous
  // offending-field search only matched a DatePicker field carrying a
  // month/year `type`, so it never caught this direction.
  const composerProtocolWithCoarseDatetimes = (
    stage: Record<string, unknown>,
  ) => {
    const base = createBaseProtocol();
    return {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...base.codebook.node.person,
            variables: {
              ...base.codebook.node.person.variables,
              event_a: {
                name: 'EventA',
                type: 'datetime',
                component: ComponentTypes.DatePicker,
                parameters: { type: 'year' },
                validation: { sameAs: 'event_b' },
              },
              event_b: {
                name: 'EventB',
                type: 'datetime',
                component: ComponentTypes.DatePicker,
                parameters: { type: 'year' },
              },
            },
          },
        },
      },
      stages: [stage],
    };
  };

  // Twelfth-wave Finding 1: a field that omits `parameters` INHERITS the
  // codebook variable's, exactly as the interview runtime resolves it
  // (`fieldParameters ?? codebookParameters`, see interview's
  // selectors/forms.ts). Re-declaring the component without repeating
  // `{ type: 'year' }` therefore still renders at year resolution and desyncs
  // nothing — the overlay previously wrote `parameters: undefined` over the
  // codebook's, falsely rejecting this protocol.
  it('accepts a nodeForm field that omits parameters, inheriting the codebook resolution', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithCoarseDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            { variable: 'event_a', component: ComponentTypes.DatePicker },
          ],
        },
      }),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  it('rejects a nodeForm field declaring a resolution that differs from the coarse codebook baseline', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithCoarseDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.DatePicker,
              parameters: { type: 'month' },
            },
          ],
        },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'parameters',
    ]);
  });

  // Inheritance is whole-object, not a deep merge — again mirroring the
  // runtime's `??`. A field declaring ANY parameters of its own replaces the
  // codebook's outright, so omitting `type` here really does render at full
  // resolution and desyncs the year-resolution group.
  it('rejects a nodeForm field whose own parameters drop the codebook resolution', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithCoarseDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.DatePicker,
              parameters: { min: '2020-01-01' },
            },
          ],
        },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'parameters',
    ]);
  });

  it('rejects a nodeForm field overriding a coarse codebook baseline to full resolution via RelativeDatePicker', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithCoarseDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.RelativeDatePicker,
              parameters: { anchor: '2020-01-01' },
            },
          ],
        },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'parameters',
    ]);
  });

  it('accepts a nodeForm field overriding one member to match a coarse codebook baseline', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithCoarseDatetimes({
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.DatePicker,
              parameters: { type: 'year' },
            },
          ],
        },
      }),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });
});

describe('NetworkComposer stage-effective overlay contradictions (tenth-wave Finding 1)', () => {
  // Same shape as composerProtocolWithDatetimes above, but with codebook
  // variables that may carry their own DatePicker component/parameters so a
  // test can stage a contradiction in the codebook itself.
  const composerProtocolWith = (
    variables: Record<string, Record<string, unknown>>,
    stage: Record<string, unknown>,
  ) => {
    const base = createBaseProtocol();
    return {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...base.codebook.node.person,
            variables: {
              ...base.codebook.node.person.variables,
              ...variables,
            },
          },
        },
      },
      stages: [stage],
    };
  };

  const sameAsDatetimePair = {
    event_a: {
      name: 'EventA',
      type: 'datetime',
      validation: { sameAs: 'event_b' },
    },
    event_b: { name: 'EventB', type: 'datetime' },
  };

  // The old check only re-ran the mixed-resolution query on the overlay, so a
  // same-resolution overlay contradiction of any other class slipped through:
  // here both fields render full-resolution DatePickers, but their pinned
  // (min = max) windows sit on different days, so the sameAs-joined pair can
  // never actually hold equal values.
  it('rejects fields pinning a sameAs-joined pair to disjoint fixed windows, anchored at the first field', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWith(sameAsDatetimePair, {
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.DatePicker,
              parameters: { min: '2020-01-01', max: '2020-01-01' },
            },
            {
              variable: 'event_b',
              component: ComponentTypes.DatePicker,
              parameters: { min: '2020-06-01', max: '2020-06-01' },
            },
          ],
        },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.message).toContain('leave no value they can share');
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'parameters',
    ]);
  });

  // A contradiction the bare codebook already exhibits is the record-level
  // check's to report; the composer overlay (here replicating the codebook's
  // own component/parameters exactly) must not add a second issue at the
  // stage fields path.
  it('does not double-report a contradiction that exists purely in the codebook', () => {
    const contradictoryCodebookPair = {
      event_a: {
        name: 'EventA',
        type: 'datetime',
        component: ComponentTypes.DatePicker,
        parameters: { min: '2020-01-01', max: '2020-01-01' },
        validation: { sameAs: 'event_b' },
      },
      event_b: {
        name: 'EventB',
        type: 'datetime',
        component: ComponentTypes.DatePicker,
        parameters: { min: '2020-06-01', max: '2020-06-01' },
      },
    };
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWith(contradictoryCodebookPair, {
        ...baseStage,
        nodeForm: {
          fields: [
            {
              variable: 'event_a',
              component: ComponentTypes.DatePicker,
              parameters: { min: '2020-01-01', max: '2020-01-01' },
            },
            {
              variable: 'event_b',
              component: ComponentTypes.DatePicker,
              parameters: { min: '2020-06-01', max: '2020-06-01' },
            },
          ],
        },
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    // The record-level path reports the codebook contradiction...
    expect(
      result.error.issues.some(
        (candidate) =>
          candidate.path.includes('codebook') &&
          candidate.message.includes('leave no value they can share'),
      ),
    ).toBe(true);
    // ...and the composer check stays silent for it.
    expect(
      result.error.issues.some((candidate) =>
        candidate.path.includes('nodeForm'),
      ),
    ).toBe(false);
  });
});

// Thirteenth-wave Finding 3: a composer field picks its own control from
// ComposerComponentSchema, which lists every renderable control rather than
// the ones legal for the variable it writes. Nothing previously compared the
// two, so a numeric variable rendered as a DatePicker parsed cleanly while
// the runtime persisted a date string into a numeric variable.
describe('NetworkComposer stage-field component/variable-type pairing', () => {
  const composerProtocolWithPersonVariables = (
    variables: Record<string, Record<string, unknown>>,
    stage: Record<string, unknown>,
  ) => {
    const base = createBaseProtocol();
    return {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...base.codebook.node.person,
            variables: {
              ...base.codebook.node.person.variables,
              ...variables,
            },
          },
        },
      },
      stages: [stage],
    };
  };

  const nodeFormOnly = (fields: Record<string, unknown>[]) => ({
    ...baseStage,
    nodeForm: { fields },
    edges: [],
  });

  it('rejects a DatePicker field for a number variable, anchored at the component', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        {},
        nodeFormOnly([
          { variable: 'age', component: ComponentTypes.DatePicker },
        ]),
      ),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('cannot render a number variable'),
    );
    expect(issue?.message).toContain('Valid controls: Number');
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'component',
    ]);
  });

  it('rejects a Number field for a categorical variable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        {},
        nodeFormOnly([
          { variable: 'category', component: ComponentTypes.Number },
        ]),
      ),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((candidate) =>
        candidate.message.includes('cannot render a categorical variable'),
      ),
    ).toBe(true);
  });

  it('rejects a field for a layout variable as non-renderable', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        {},
        nodeFormOnly([
          { variable: 'layoutPosition', component: ComponentTypes.Text },
        ]),
      ),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((candidate) =>
        candidate.message.includes('cannot be rendered as a form field'),
      ),
    ).toBe(true);
  });

  it('rejects an illegal pairing in an edge form too', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        {},
        {
          ...baseStage,
          nodeForm: { fields: [] },
          edges: [
            {
              id: 'edge-1',
              subject: { entity: 'edge', type: 'knows' },
              form: {
                fields: [
                  {
                    variable: 'duration',
                    component: ComponentTypes.RadioGroup,
                  },
                ],
              },
            },
          ],
        },
      ),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('cannot render a number variable'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'edges',
      0,
      'form',
      'fields',
      0,
      'component',
    ]);
  });

  it.each([
    ['datetime', ComponentTypes.DatePicker],
    ['datetime', ComponentTypes.RelativeDatePicker],
  ])('accepts a %s variable rendered as %s', (_type, component) => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        { event_a: { name: 'EventA', type: 'datetime' } },
        nodeFormOnly([{ variable: 'event_a', component }]),
      ),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  it.each([
    ['age', ComponentTypes.Number],
    ['name', ComponentTypes.Text],
    ['name', ComponentTypes.TextArea],
    ['category', ComponentTypes.CheckboxGroup],
    ['category', ComponentTypes.ToggleButtonGroup],
    ['strength', ComponentTypes.RadioGroup],
    ['strength', ComponentTypes.LikertScale],
  ])(
    'accepts the codebook variable %s rendered as %s',
    (variable, component) => {
      const result = ProtocolSchemaV8.safeParse(
        composerProtocolWithPersonVariables(
          {},
          nodeFormOnly([{ variable, component }]),
        ),
      );
      expect(
        result.success,
        JSON.stringify(!result.success && result.error.issues),
      ).toBe(true);
    },
  );

  it.each([
    ['boolean', ComponentTypes.Boolean],
    ['boolean', ComponentTypes.Toggle],
  ])('accepts a %s variable rendered as %s', (_type, component) => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        { is_close: { name: 'IsClose', type: 'boolean' } },
        nodeFormOnly([{ variable: 'is_close', component }]),
      ),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  // Twenty-eighth-wave Finding 1: `options: []` on a componentless boolean
  // now passes the record-level shape rule (variable.ts), since a
  // componentless variable's rendering is decided by the composer field, not
  // the codebook. That means the genuinely broken pairing — a field that
  // actually RENDERS the variable through `Boolean` (which fresco-ui's
  // BooleanField renders with no buttons at all over an empty array) — has to
  // be caught here, where the field's own component is known.
  it('rejects a componentless boolean with empty options rendered as Boolean, anchored at the field', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        { is_close: { name: 'IsClose', type: 'boolean', options: [] } },
        nodeFormOnly([
          { variable: 'is_close', component: ComponentTypes.Boolean },
        ]),
      ),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('no choice to offer'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'component',
    ]);
  });

  it('accepts a componentless boolean with empty options rendered as Toggle', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        { is_close: { name: 'IsClose', type: 'boolean', options: [] } },
        nodeFormOnly([
          { variable: 'is_close', component: ComponentTypes.Toggle },
        ]),
      ),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  it('accepts a scalar variable rendered as a VisualAnalogScale', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        { warmth: { name: 'Warmth', type: 'scalar' } },
        nodeFormOnly([
          { variable: 'warmth', component: ComponentTypes.VisualAnalogScale },
        ]),
      ),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  // The entity-attribute reference pass owns the missing-variable error; the
  // component check must skip such a field rather than crash on it.
  it('leaves a field naming a variable absent from the codebook to the reference pass', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithPersonVariables(
        {},
        nodeFormOnly([
          { variable: 'not_in_codebook', component: ComponentTypes.DatePicker },
        ]),
      ),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((candidate) =>
        candidate.message.includes('cannot render'),
      ),
    ).toBe(false);
  });

  // Thirteenth-wave Finding 1 note: the composer duplicate-variable check is
  // per form, but the SAME variable id in a nodeForm and an edge form is not
  // expressible in a valid protocol anyway — the codebook rejects a variable
  // record key reused across entity types. The per-form scope is covered at
  // stage level in network-composer.test.ts.
});

// Twentieth-wave Finding 3: each composer stage's overlay is a per-stage view.
// Reading an endpoint that a DIFFERENT composer stage renders through its
// codebook default invents a mismatch the runtime never has, so an endpoint
// whose effective rendering this form does not determine is left out of the
// overlay entirely.
describe('NetworkComposer cross-stage overlay resolution (twentieth-wave Finding 3)', () => {
  const composerProtocolWithStages = (stages: Record<string, unknown>[]) => {
    const base = createBaseProtocol();
    return {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...base.codebook.node.person,
            variables: {
              ...base.codebook.node.person.variables,
              event_a: {
                name: 'EventA',
                type: 'datetime',
                validation: { sameAs: 'event_b' },
              },
              event_b: { name: 'EventB', type: 'datetime' },
            },
          },
        },
      },
      stages,
    };
  };

  const composerStage = (
    id: string,
    fields: Record<string, unknown>[],
  ): Record<string, unknown> => ({
    ...baseStage,
    id,
    nodeForm: { fields },
    edges: [],
  });

  // Both variables really are stored as 'YYYY' at interview time, so the
  // sameAs is satisfiable and neither stage may be rejected.
  it('accepts sameAs-joined variables rendered at matching resolutions by two different composer stages', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithStages([
        composerStage('nc1', [
          {
            variable: 'event_a',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year' },
          },
        ]),
        composerStage('nc2', [
          {
            variable: 'event_b',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year' },
          },
        ]),
      ]),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  // Both endpoints are rendered by fields of ONE form, so their effective
  // renderings are known together and a genuine mismatch is still reported.
  it('still rejects differing resolutions rendered by one composer form', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithStages([
        composerStage('nc1', [
          {
            variable: 'event_a',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year' },
          },
          {
            variable: 'event_b',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'month' },
          },
        ]),
      ]),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.message).toContain('store dates at different resolutions');
  });

  // The partner is not overridden by ANY composer field, so its codebook
  // default IS its effective rendering everywhere and the pair stays checked.
  it('still rejects an override against a partner no composer field overrides', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWithStages([
        composerStage('nc1', [
          {
            variable: 'event_a',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year' },
          },
        ]),
        composerStage('nc2', [
          { variable: 'age', component: ComponentTypes.Number },
        ]),
      ]),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('make its validation contradictory'),
    );
    expect(issue?.message).toContain('store dates at different resolutions');
  });
});

// The skip-if-already-in-the-codebook baseline must be computed over the same
// visible subset as the overlay: a contradiction's identity carries its
// equality-group membership, so a baseline taken over the FULL codebook keys
// differently once a group member is dropped, and the codebook's own
// contradiction gets re-reported at the stage path.
describe('NetworkComposer overlay baseline tracks the visible subset', () => {
  it('does not re-report a codebook contradiction whose group loses a member to another stage', () => {
    const base = createBaseProtocol();
    const pinned = (min: string) => ({
      component: ComponentTypes.DatePicker,
      parameters: { min, max: min },
    });
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
              event_a: {
                name: 'EventA',
                type: 'datetime',
                ...pinned('2020-01-01'),
                validation: { sameAs: 'event_b' },
              },
              event_b: {
                name: 'EventB',
                type: 'datetime',
                ...pinned('2020-06-01'),
              },
              event_c: {
                name: 'EventC',
                type: 'datetime',
                validation: { sameAs: 'event_a' },
              },
            },
          },
        },
      },
      stages: [
        {
          ...baseStage,
          id: 'nc1',
          nodeForm: {
            fields: [{ variable: 'event_a', ...pinned('2020-01-01') }],
          },
          edges: [],
        },
        {
          ...baseStage,
          id: 'nc2',
          nodeForm: {
            fields: [
              { variable: 'event_c', component: ComponentTypes.DatePicker },
            ],
          },
          edges: [],
        },
      ],
    };
    const result = ProtocolSchemaV8.safeParse(protocol);
    expect(result.success).toBe(false);
    if (result.success) return;
    // The record-level check owns the codebook's own contradiction...
    expect(
      result.error.issues.some(
        (candidate) =>
          candidate.path.includes('codebook') &&
          candidate.message.includes('leave no value they can share'),
      ),
    ).toBe(true);
    // ...and no composer form re-reports it.
    expect(
      result.error.issues.filter((candidate) =>
        candidate.message.includes('make its validation contradictory'),
      ),
    ).toEqual([]);
  });
});

// Thirtieth-wave Finding 1: an override can break a pair it never names. A
// field pinning EventA's floor propagates through EventA's `sameAs` group
// into EventB, making EventB's own comparator against the pinned EventC
// infeasible — the analyser reports participants [EventB, EventC] only, so
// the participant-membership anchor found no field and dropped the
// contradiction, silently accepting a stage whose form is unusable.
describe('NetworkComposer overlay contradictions among non-overridden variables (thirtieth-wave Finding 1)', () => {
  const composerProtocolWith = (
    variables: Record<string, Record<string, unknown>>,
    stage: Record<string, unknown>,
  ) => {
    const base = createBaseProtocol();
    return {
      ...base,
      codebook: {
        ...base.codebook,
        node: {
          ...base.codebook.node,
          person: {
            ...base.codebook.node.person,
            variables: {
              ...base.codebook.node.person.variables,
              ...variables,
            },
          },
        },
      },
      stages: [stage],
    };
  };

  // EventA sameAs EventB; EventB < EventC; EventC pinned to one day. The
  // codebook alone is satisfiable (EventA/EventB carry no bounds of their
  // own) — only a field's floor override on EventA can break EventB < EventC.
  const propagationTrio = {
    event_a: {
      name: 'EventA',
      type: 'datetime',
      validation: { sameAs: 'event_b' },
    },
    event_b: {
      name: 'EventB',
      type: 'datetime',
      validation: { lessThanVariable: 'event_c' },
    },
    event_c: {
      name: 'EventC',
      type: 'datetime',
      component: ComponentTypes.DatePicker,
      parameters: { min: '2020-01-01', max: '2020-01-01' },
    },
  };

  const floorField = {
    variable: 'event_a',
    component: ComponentTypes.DatePicker,
    parameters: { min: '2020-01-01' },
  };

  it('rejects an override whose floor breaks a comparator between two non-overridden variables, anchored at the causing field', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWith(propagationTrio, {
        ...baseStage,
        nodeForm: { fields: [floorField] },
        edges: [],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const composerIssues = result.error.issues.filter((candidate) =>
      candidate.message.includes('NetworkComposer field overrides'),
    );
    expect(composerIssues).toHaveLength(1);
    const [issue] = composerIssues;
    // The wrapper names the causing field's variable; the analyser's message
    // names the broken pair.
    expect(issue?.message).toContain('"EventA"');
    expect(issue?.message).toContain('EventB');
    expect(issue?.message).toContain('EventC');
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      0,
      'parameters',
    ]);
  });

  it('anchors at the first reference-connected field, skipping unrelated fields', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWith(propagationTrio, {
        ...baseStage,
        nodeForm: {
          fields: [
            { variable: 'age', component: ComponentTypes.Number },
            floorField,
          ],
        },
        edges: [],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('NetworkComposer field overrides'),
    );
    expect(issue?.path).toEqual([
      'stages',
      0,
      'nodeForm',
      'fields',
      1,
      'parameters',
    ]);
  });

  it('accepts the same codebook when the field carries no floor override', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWith(propagationTrio, {
        ...baseStage,
        nodeForm: {
          fields: [
            { variable: 'event_a', component: ComponentTypes.DatePicker },
          ],
        },
        edges: [],
      }),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });

  // When the CODEBOOK itself already breaks EventB < EventC (EventB's floor
  // comes from its own codebook parameters), the record-level check owns the
  // report and the stage must stay silent even though no participant is a
  // field here either.
  it('does not re-report a baseline-present contradiction between non-overridden variables at the stage', () => {
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWith(
        {
          ...propagationTrio,
          event_b: {
            ...propagationTrio.event_b,
            component: ComponentTypes.DatePicker,
            parameters: { min: '2020-01-01' },
          },
        },
        {
          ...baseStage,
          nodeForm: { fields: [floorField] },
          edges: [],
        },
      ),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some(
        (candidate) =>
          candidate.path.includes('codebook') &&
          candidate.message.includes('can never be satisfied'),
      ),
    ).toBe(true);
    expect(
      result.error.issues.filter((candidate) =>
        candidate.message.includes('NetworkComposer field overrides'),
      ),
    ).toEqual([]);
  });

  // A pair only provable in stage-effective mode (two singleton-domain
  // Booleans joined by differentFrom) that no composer field anywhere
  // overrides and this form never renders is latent codebook state, not this
  // overlay's introduction: it appears identically in the stage-effective
  // baseline and must not be reported at the stage (and record-level mode
  // never judges it either, so the protocol stays accepted).
  it('accepts a latent stage-effective-only pair this form never renders', () => {
    const trueOnly = [{ label: 'Yes', value: true }];
    const result = ProtocolSchemaV8.safeParse(
      composerProtocolWith(
        {
          flag_a: {
            name: 'FlagA',
            type: 'boolean',
            component: ComponentTypes.Boolean,
            options: trueOnly,
            validation: { differentFrom: 'flag_b' },
          },
          flag_b: {
            name: 'FlagB',
            type: 'boolean',
            component: ComponentTypes.Boolean,
            options: trueOnly,
          },
        },
        {
          ...baseStage,
          nodeForm: {
            fields: [{ variable: 'age', component: ComponentTypes.Number }],
          },
          edges: [],
        },
      ),
    );
    expect(
      result.success,
      JSON.stringify(!result.success && result.error.issues),
    ).toBe(true);
  });
});
