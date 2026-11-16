import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateProtocol } from '../../../index.ts';
import { ProtocolSchemaV9 } from '../schema.ts';

const exampleDir = new URL(
  '../../../../../protocols/examples/custom-node-shapes/',
  import.meta.url,
);

const readExample = (): unknown =>
  JSON.parse(readFileSync(new URL('protocol.json', exampleDir), 'utf8'));

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

  it('draws every custom shape with an image asset bundled beside it', () => {
    const protocol = ProtocolSchemaV9.parse(readExample());
    const customShapes = Object.values(protocol.codebook.node ?? {}).flatMap(
      (nodeType) => Object.values(nodeType.customShapes ?? {}),
    );
    expect(customShapes).toHaveLength(24);
    for (const { asset } of customShapes) {
      const entry = protocol.assetManifest?.[asset];
      if (entry?.type !== 'image') throw new Error(`${asset} is not an image`);
      expect(existsSync(new URL(`assets/${entry.source}`, exampleDir))).toBe(
        true,
      );
    }
  });
});
