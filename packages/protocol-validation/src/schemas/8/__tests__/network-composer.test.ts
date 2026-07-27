import { describe, expect, it } from 'vitest';

import { stageSchema } from '../stages/index.ts';
import { networkComposerStage } from '../stages/network-composer.ts';
import { ComponentTypes } from '../variables/types.ts';

const validStage = {
  id: 'nc1',
  label: 'Build the network',
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
  background: { concentricCircles: 4 },
  edges: [{ id: 'edge-1', subject: { entity: 'edge', type: 'knows' } }],
};

describe('networkComposerStage schema', () => {
  it('accepts a minimal valid stage', () => {
    expect(networkComposerStage.safeParse(validStage).success).toBe(true);
  });

  it('requires quickAdd', () => {
    const { quickAdd: _quickAdd, ...withoutQuickAdd } = validStage;
    const result = networkComposerStage.safeParse(withoutQuickAdd);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path.includes('quickAdd')),
      ).toBe(true);
    }
  });

  it('requires layoutVariable', () => {
    const { layoutVariable: _layoutVariable, ...withoutLayout } = validStage;
    const result = networkComposerStage.safeParse(withoutLayout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.path.includes('layoutVariable'),
        ),
      ).toBe(true);
    }
  });

  it('accepts an empty edges array (no minimum-edge requirement)', () => {
    const result = networkComposerStage.safeParse({ ...validStage, edges: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a stage with no edges field (edges optional after prune)', () => {
    const { edges: _edges, ...noEdges } = validStage;
    const result = networkComposerStage.safeParse(noEdges);
    expect(result.success).toBe(true);
  });

  it('rejects duplicate edge types', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
      edges: [
        { id: 'edge-1', subject: { entity: 'edge', type: 'knows' } },
        { id: 'edge-2', subject: { entity: 'edge', type: 'knows' } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes('duplicate'),
        ),
      ).toBe(true);
    }
  });

  it('accepts an optional convexHullVariable', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
      convexHullVariable: 'friendshipGroup',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional forms, an image background, and behaviours', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
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
      background: {
        image: 'assets/background.png',
        skewedTowardCenter: true,
      },
      behaviours: { automaticLayout: false },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a background that sets both an image and concentricCircles', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
      background: { image: 'assets/background.png', concentricCircles: 4 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing background', () => {
    const { background: _background, ...withoutBackground } = validStage;
    expect(networkComposerStage.safeParse(withoutBackground).success).toBe(
      false,
    );
  });
});

describe('stage discriminated union', () => {
  it('discriminates a NetworkComposer stage', () => {
    const result = stageSchema.safeParse(validStage);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('NetworkComposer');
    }
  });
});

const baseStageWithComponent = {
  id: 's1',
  type: 'NetworkComposer' as const,
  label: 'Compose',
  subject: { entity: 'node' as const, type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layout',
  background: { concentricCircles: 4 },
  edges: [],
};

describe('ComposerFormFieldSchema', () => {
  it('accepts a nodeForm field that carries a component and omits label', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [{ variable: 'age', component: ComponentTypes.Number }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty nodeForm.fields array', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: { fields: [] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a nodeForm with no fields (fields optional)', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects a nodeForm field with an unknown component', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: { fields: [{ variable: 'age', component: 'NotAControl' }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a nodeForm field that still uses prompt (renamed to label)', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          { variable: 'age', component: ComponentTypes.Number, prompt: 'Age?' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('carries component + parameters + label on an edge form field', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              {
                variable: 'closeness',
                component: ComponentTypes.VisualAnalogScale,
                parameters: { minLabel: 'Distant', maxLabel: 'Close' },
                label: 'How close?',
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  // Third-wave Finding 7: a DatePicker/RelativeDatePicker stage field's
  // `parameters` must satisfy the same shape+refinement as the codebook
  // DatePicker/RelativeDatePicker (variable.ts) — previously `parameters` was
  // an unrestricted record here, escaping the DatePicker refinement entirely.
  it('rejects a nodeForm DatePicker field with a bound finer than its resolution', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          {
            variable: 'birth_date',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year', min: '2020-05-03' },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  // Eighth-wave Finding 2: the composer field schema reuses
  // `datePickerParametersSchema` (variable.ts) directly, so the year-below-
  // 1000 floor at year/month resolution applies here without any
  // composer-specific code.
  it('rejects a nodeForm DatePicker field with a year-resolution bound below 1000', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          {
            variable: 'birth_year',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year', min: '0099' },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  // Eleventh-wave Finding 1: the year-zero full-resolution rejection also
  // arrives here through the shared `datePickerParametersSchema` — the native
  // date input cannot select any date in year 0000.
  it('rejects a nodeForm DatePicker field with a full-resolution year-zero bound', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          {
            variable: 'birth_date',
            component: ComponentTypes.DatePicker,
            parameters: { max: '0000-12-31' },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a nodeForm DatePicker field with min after max', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          {
            variable: 'birth_date',
            component: ComponentTypes.DatePicker,
            parameters: { min: '2021-06-01', max: '2020-01-01' },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an edge form RelativeDatePicker field with a negative before offset', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              {
                variable: 'met_date',
                component: ComponentTypes.RelativeDatePicker,
                parameters: { before: -1 },
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  // Ninth-wave Finding 6, consistent with the wave-8 coarse-resolution year
  // floor: fresco-ui's runtime ymd arithmetic still two-digit-coerces a
  // small year, so a RelativeDatePicker anchor below 1000 would already
  // produce a wrong window even though it is a real, round-tripping ISO
  // date.
  it('rejects an edge form RelativeDatePicker field with an anchor year below 1000', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              {
                variable: 'met_date',
                component: ComponentTypes.RelativeDatePicker,
                parameters: { anchor: '0999-12-31' },
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an edge form RelativeDatePicker field with an anchor year at exactly 1000', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              {
                variable: 'met_date',
                component: ComponentTypes.RelativeDatePicker,
                parameters: { anchor: '1000-01-01' },
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid nodeForm DatePicker window and a valid edge RelativeDatePicker window', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          {
            variable: 'birth_year',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year', min: '1990', max: '2020' },
          },
        ],
      },
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              {
                variable: 'met_date',
                component: ComponentTypes.RelativeDatePicker,
                parameters: { anchor: '2020-01-01', before: 180, after: 0 },
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('leaves an unrestricted parameters record alone for non-date components', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          {
            variable: 'closeness',
            component: ComponentTypes.VisualAnalogScale,
            parameters: { minLabel: 'Distant', maxLabel: 'Close', extra: true },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

// Thirteenth-wave Finding 1: every field renders under its variable's name
// (interview's useProtocolForm passes `name: field.variable`), so two fields
// for one variable collide on a single form value while each contributes its
// own control and parameters — e.g. two required DatePickers pinned to
// disjoint singleton windows, which no value can satisfy.
describe('ComposerFormSchema duplicate variables', () => {
  it('rejects a nodeForm listing the same variable twice, anchored at the second field', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          {
            variable: 'birth_year',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year', min: '1990', max: '1990' },
          },
          {
            variable: 'birth_year',
            component: ComponentTypes.DatePicker,
            parameters: { type: 'year', min: '2000', max: '2000' },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('duplicate variable "birth_year"'),
    );
    expect(issue?.path).toEqual(['nodeForm', 'fields', 1, 'variable']);
  });

  it('rejects a duplicate variable in an edge form', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [
              { variable: 'met_date', component: ComponentTypes.DatePicker },
              { variable: 'met_date', component: ComponentTypes.DatePicker },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('duplicate variable "met_date"'),
    );
    expect(issue?.path).toEqual(['edges', 0, 'form', 'fields', 1, 'variable']);
  });

  // The check is scoped to ONE form: a nodeForm field and an edge form field
  // resolve against different subjects and render in different form
  // instances, so a repeat across the two is not a collision. (A protocol
  // could not express this anyway — the codebook rejects a variable record
  // key reused across entity types — which is exactly why the scoping is
  // pinned here, at stage level, where no codebook is in play.)
  it('accepts the same variable name once in nodeForm and once in an edge form', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [{ variable: 'note', component: ComponentTypes.Text }],
      },
      edges: [
        {
          id: 'e1',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [{ variable: 'note', component: ComponentTypes.Text }],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts two fields for different variables', () => {
    const result = networkComposerStage.safeParse({
      ...baseStageWithComponent,
      nodeForm: {
        fields: [
          { variable: 'age', component: ComponentTypes.Number },
          { variable: 'name', component: ComponentTypes.Text },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
