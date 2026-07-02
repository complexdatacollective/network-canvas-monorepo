import { describe, expect, it } from 'vitest';

import { stageSchema } from '../stages';
import { networkComposerStage } from '../stages/network-composer';
import { ComponentTypes } from '../variables/types';

const validStage = {
  id: 'nc1',
  label: 'Build the network',
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
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

  it('accepts optional forms, background and behaviours', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
      nodeForm: {
        fields: [
          { variable: 'age', component: ComponentTypes.Number, prompt: 'Age?' },
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
                prompt: 'How close?',
              },
            ],
          },
        },
      ],
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { automaticLayout: false },
    });
    expect(result.success).toBe(true);
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
  edges: [],
};

describe('ComposerFormFieldSchema', () => {
  it('accepts a nodeForm field that carries a component and omits prompt', () => {
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

  it('carries component + parameters + prompt on an edge form field', () => {
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
                prompt: 'How close?',
              },
            ],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
