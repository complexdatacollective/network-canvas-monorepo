import { describe, expect, it } from 'vitest';

import { networkComposerStage } from '@codaco/protocol-validation';

const stage = {
  id: 's1',
  label: 'Compose',
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
  background: { concentricCircles: 4 },
  nodeForm: {
    fields: [{ variable: 'age', component: 'Number', label: 'Age?' }],
  },
  edges: [
    {
      id: 'edge-1',
      subject: { entity: 'edge', type: 'knows' },
      form: {
        fields: [
          {
            variable: 'closeness',
            component: 'VisualAnalogScale',
            label: 'How close?',
          },
        ],
      },
    },
  ],
};

describe('NetworkComposer editor output validates', () => {
  it('accepts a fully-configured stage', () => {
    expect(networkComposerStage.safeParse(stage).success).toBe(true);
  });

  it('accepts a stage with no edges (empty array is valid)', () => {
    expect(
      networkComposerStage.safeParse({ ...stage, edges: [] }).success,
    ).toBe(true);
  });

  it('rejects a stage with duplicate edge subject types', () => {
    expect(
      networkComposerStage.safeParse({
        ...stage,
        edges: [
          { id: 'edge-1', subject: { entity: 'edge', type: 'knows' } },
          { id: 'edge-2', subject: { entity: 'edge', type: 'knows' } },
        ],
      }).success,
    ).toBe(false);
  });
});
