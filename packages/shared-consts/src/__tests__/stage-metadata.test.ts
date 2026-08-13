import { describe, expect, expectTypeOf, it } from 'vitest';

import type { VariableValue } from '../network.ts';
import {
  isFamilyPedigreeStageMetadata,
  StageMetadataSchema,
  type StageMetadata,
} from '../stage-metadata.ts';

const familyPedigreeMetadata = (attributes: Record<string, unknown>) => ({
  familyPedigree: {
    isNetworkCommitted: true,
    edges: [
      {
        id: 'edge-1',
        from: 'node-1',
        to: 'node-2',
        attributes,
      },
    ],
  },
});

describe('StageMetadataSchema', () => {
  it('normalizes legacy Family Pedigree edge attributes to sparse values', () => {
    const parsed = StageMetadataSchema.parse(
      familyPedigreeMetadata({
        removeNull: null,
        removeUndefined: undefined,
        keepFalse: false,
        keepZero: 0,
        keepEmptyString: '',
        keepEmptyArray: [],
      }),
    );

    expect(parsed.familyPedigree).toStrictEqual({
      isNetworkCommitted: true,
      edges: [
        {
          id: 'edge-1',
          from: 'node-1',
          to: 'node-2',
          attributes: {
            keepFalse: false,
            keepZero: 0,
            keepEmptyString: '',
            keepEmptyArray: [],
          },
        },
      ],
    });
  });

  it('rejects invalid defined Family Pedigree edge attributes', () => {
    expect(
      StageMetadataSchema.safeParse(
        familyPedigreeMetadata({ invalid: { nested: 'object' } }),
      ).success,
    ).toBe(false);
  });

  it('guards only strict parsed Family Pedigree metadata', () => {
    const legacy = familyPedigreeMetadata({
      removeNull: null,
      removeUndefined: undefined,
      keep: false,
    }).familyPedigree;

    expect(isFamilyPedigreeStageMetadata(legacy)).toBe(false);

    const parsed = StageMetadataSchema.parse({ familyPedigree: legacy });
    expect(isFamilyPedigreeStageMetadata(parsed.familyPedigree)).toBe(true);
    expect(parsed.familyPedigree).toMatchObject({
      edges: [{ attributes: { keep: false } }],
    });
  });

  it('exposes defined Family Pedigree edge attribute output types', () => {
    type FamilyPedigreeMetadata = Extract<
      StageMetadata[string],
      { isNetworkCommitted: boolean }
    >;
    type Edge = NonNullable<FamilyPedigreeMetadata['edges']>[number];

    expectTypeOf<Edge['attributes'][string]>().toEqualTypeOf<VariableValue>();
    expectTypeOf<null>().not.toMatchTypeOf<Edge['attributes'][string]>();
    expectTypeOf<undefined>().not.toMatchTypeOf<Edge['attributes'][string]>();
  });
});
