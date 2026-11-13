import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateProtocol } from '../../../index.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

const readExample = (): unknown =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../../protocols/examples/custom-node-shapes/protocol.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

describe('custom node shapes example protocol', () => {
  it('is a valid schema 9 protocol', async () => {
    const result = await validateProtocol(readExample());
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it('maps every option of the type attribute to a custom shape', () => {
    const protocol = ProtocolSchemaV9.parse(readExample());
    const nodeTypes = Object.values(protocol.codebook.node ?? {});
    expect(nodeTypes).toHaveLength(2);
    for (const nodeType of nodeTypes) {
      const mapping = nodeType.shape.dynamic;
      if (mapping?.type !== 'discrete') throw new Error('expected a mapping');
      const shapeIds = Object.keys(nodeType.customShapes ?? {});
      expect(shapeIds).toHaveLength(12);
      expect(mapping.map.map((entry) => entry.shape)).toEqual(
        shapeIds.map((id) => `custom:${id}`),
      );
    }
  });
});
