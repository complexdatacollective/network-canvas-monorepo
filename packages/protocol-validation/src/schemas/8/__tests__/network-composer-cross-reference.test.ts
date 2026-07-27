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
            variable: 'closeness',
            component: ComponentTypes.VisualAnalogScale,
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
      candidate.message.includes(
        'renders it at a datetime resolution that no longer matches',
      ),
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
      candidate.message.includes(
        'renders it at a datetime resolution that no longer matches',
      ),
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
});
