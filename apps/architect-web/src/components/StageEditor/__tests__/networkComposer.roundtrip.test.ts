import { describe, expect, it } from 'vitest';

import { networkComposerStage } from '@codaco/protocol-validation';

const stage = {
  id: 's1',
  label: 'Compose',
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
  nodeForm: { fields: [{ variable: 'age', prompt: 'Age?' }] },
  edges: [
    {
      subject: { entity: 'edge', type: 'knows' },
      form: { fields: [{ variable: 'closeness', prompt: 'How close?' }] },
    },
  ],
};

describe('NetworkComposer editor output validates', () => {
  it('accepts a fully-configured stage', () => {
    expect(networkComposerStage.safeParse(stage).success).toBe(true);
  });

  it('rejects a stage with no edges', () => {
    expect(
      networkComposerStage.safeParse({ ...stage, edges: [] }).success,
    ).toBe(false);
  });

  it('rejects a stage with duplicate edge subject types', () => {
    expect(
      networkComposerStage.safeParse({
        ...stage,
        edges: [
          { subject: { entity: 'edge', type: 'knows' } },
          { subject: { entity: 'edge', type: 'knows' } },
        ],
      }).success,
    ).toBe(false);
  });
});
