import { describe, expect, it } from 'vitest';

import {
  networkComposerStage,
  createProtocolObjectId,
} from '@codaco/protocol-validation';

const stage = {
  id: createProtocolObjectId(),
  label: { en: 'Compose' },
  type: 'NetworkComposer',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  layoutVariable: 'layoutPosition',
  background: { concentricCircles: 4 },
  nodeForm: {
    fields: [
      {
        id: createProtocolObjectId(),
        variable: 'age',
        component: 'Number',
        label: { en: 'Age?' },
      },
    ],
  },
  edges: [
    {
      id: createProtocolObjectId(),
      subject: { entity: 'edge', type: 'knows' },
      label: { en: 'Connection' },
      form: {
        fields: [
          {
            id: createProtocolObjectId(),
            variable: 'closeness',
            component: 'VisualAnalogScale',
            label: { en: 'How close?' },
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
          {
            id: createProtocolObjectId(),
            subject: { entity: 'edge', type: 'knows' },
            label: { en: 'Connection' },
          },
          {
            id: createProtocolObjectId(),
            subject: { entity: 'edge', type: 'knows' },
            label: { en: 'Connection' },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
