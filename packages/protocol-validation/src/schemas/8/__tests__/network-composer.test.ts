import { describe, expect, it } from 'vitest';

import { stageSchema } from '../stages';
import { networkComposerStage } from '../stages/network-composer';

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

  it('requires at least one edge type', () => {
    const result = networkComposerStage.safeParse({ ...validStage, edges: [] });
    expect(result.success).toBe(false);
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

  it('accepts optional forms, background and behaviours', () => {
    const result = networkComposerStage.safeParse({
      ...validStage,
      nodeForm: { fields: [{ variable: 'age', prompt: 'Age?' }] },
      edges: [
        {
          id: 'edge-1',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [{ variable: 'closeness', prompt: 'How close?' }] },
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
