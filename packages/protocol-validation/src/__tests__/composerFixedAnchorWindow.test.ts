import { describe, expect, it } from 'vitest';

import ProtocolSchemaV8 from '../schemas/8/schema.ts';
import { createBaseProtocol } from '../utils/test-utils.ts';

type Loose = Record<string, unknown>;

const parse = (protocol: unknown) => ProtocolSchemaV8.safeParse(protocol);

describe('composer RelativeDatePicker field with a fixed anchor', () => {
  it('rejects a synthetic window outside the fixed anchor window', () => {
    const protocol = createBaseProtocol();
    (protocol.codebook.node.person.variables as Loose).dob = {
      name: 'DOB',
      type: 'datetime',
      synthetic: {
        distribution: 'uniform',
        min: '1950-01-01',
        max: '1960-12-31',
      },
    };
    (protocol.stages as Loose[]).push({
      id: 'nc-rel-window',
      label: 'Build the network',
      type: 'NetworkComposer',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      layoutVariable: 'layoutPosition',
      background: { concentricCircles: 4 },
      nodeForm: {
        fields: [
          {
            variable: 'dob',
            component: 'RelativeDatePicker',
            parameters: { anchor: '2020-06-01', before: 30, after: 0 },
          },
        ],
      },
    } as unknown as Loose);

    const result = parse(protocol);
    expect(result.success).toBe(false);
  });
});
