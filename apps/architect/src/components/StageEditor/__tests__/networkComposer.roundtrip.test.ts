import { describe, expect, it } from 'vitest';

import {
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  networkComposerStage,
  createProtocolObjectId,
} from '@codaco/protocol-validation';

const KNOWS = testTypeId('knows');

const stage = {
  id: createProtocolObjectId(),
  label: { en: 'Compose' },
  type: 'NetworkComposer',
  subject: { entity: 'node', types: [testTypeId('person')] },
  quickAdd: testVariableId('name'),
  layoutVariable: testVariableId('layoutPosition'),
  background: { concentricCircles: 4 },
  nodeForm: {
    fields: [
      {
        id: createProtocolObjectId(),
        variable: testVariableId('age'),
        component: 'Number',
        label: { en: 'Age?' },
      },
    ],
  },
  edges: [
    {
      id: createProtocolObjectId(),
      subject: { entity: 'edge', type: KNOWS },
      label: { en: 'Connection' },
      form: {
        fields: [
          {
            id: createProtocolObjectId(),
            variable: testVariableId('closeness'),
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
            subject: { entity: 'edge', type: KNOWS },
            label: { en: 'Connection' },
          },
          {
            id: createProtocolObjectId(),
            subject: { entity: 'edge', type: KNOWS },
            label: { en: 'Connection' },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
