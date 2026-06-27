import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '~/utils/test-utils';

import ProtocolSchemaV8 from '../schema';

const baseStage = {
  id: 'nc1',
  label: 'Build the network',
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
        nodeForm: { fields: [{ variable: 'missing', prompt: 'x' }] },
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
            subject: { entity: 'edge', type: 'knows' },
            form: { fields: [{ variable: 'age', prompt: 'x' }] },
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });
});
