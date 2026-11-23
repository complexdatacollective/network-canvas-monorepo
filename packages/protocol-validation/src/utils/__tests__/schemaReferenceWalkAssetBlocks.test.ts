import { describe, expect, it } from 'vitest';

import { ProtocolStructureSchema } from '../../schemas/9/protocol-structure.ts';
import { walkSchemaReferences } from '../schemaReferenceWalk.ts';

const protocol = {
  schemaVersion: 9,
  stages: [
    {
      id: 'info',
      type: 'Information',
      content: { en: 'Before\n\n![A](asset:one)', fr: '![B](asset:two)' },
      skipLogic: {
        action: 'SKIP',
        filter: { join: 'OR', rules: [] },
        destination: 'finish',
      },
    },
    { id: 'finish', type: 'FinishSession' },
  ],
};

describe('walkSchemaReferences without reading asset blocks', () => {
  const all = walkSchemaReferences(ProtocolStructureSchema, protocol);
  const withoutBlocks = walkSchemaReferences(
    ProtocolStructureSchema,
    protocol,
    {
      readAssetBlocks: false,
    },
  );

  it('finds the files text shows as blocks only when it reads them', () => {
    expect(
      all.flatMap((hit) => (hit.kind === 'asset' ? [hit.assetId] : [])),
    ).toEqual(['one', 'two']);
    expect(withoutBlocks.filter((hit) => hit.kind === 'asset')).toEqual([]);
  });

  it('finds every other reference and marked object as before', () => {
    expect(withoutBlocks).toEqual(all.filter((hit) => hit.kind !== 'asset'));
    expect(withoutBlocks.map((hit) => hit.kind)).toEqual(
      expect.arrayContaining(['objectId']),
    );
  });
});
