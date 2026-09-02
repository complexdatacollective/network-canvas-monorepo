import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';
import { buildMapboxToken } from '~/templates/__tests__/buildMapboxToken';
import {
  RETIRED_MAPBOX_TOKEN_IDS,
  TESTING_MAPBOX_TOKEN,
} from '~/templates/testingMapboxToken';

import {
  getHasUnusedAssets,
  getHasUnusedVariables,
  getUnusedAssets,
  getUnusedVariables,
  getUsesRetiredMapboxToken,
  getUsesTestingMapboxToken,
} from '../issues';

// Minimal protocol: asset1 + variable v1 are referenced by the stages, while
// asset2 + variable v2 are defined but never used.
//
// Two stages, because usage is derived from the SCHEMA: OrdinalBin for the
// variable (its prompts have a `variable` field the entity-attribute-reference
// extractor recognises; NameGenerator prompts do not), and NameGeneratorRoster
// for the asset (`dataSource` is a tagged asset reference on that stage type
// and nowhere else). This used to hang `dataSource` on the OrdinalBin stage,
// which no schema declares — the path-walking collector it replaced counted it
// anyway.
const protocol = {
  name: 'Test protocol',
  stages: [
    {
      id: 's1',
      type: 'OrdinalBin',
      label: 'Ordinal bin',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Rate it', variable: 'v1' }],
    },
    {
      id: 's2',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'asset1',
    },
  ],
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          v1: { name: 'Used variable', type: 'text' },
          v2: { name: 'Unused variable', type: 'text' },
        },
      },
    },
  },
  assetManifest: {
    asset1: { id: 'asset1', type: 'image', name: 'Used image' },
    asset2: { id: 'asset2', type: 'image', name: 'Unused image' },
  },
};

const buildState = (overrides?: Record<string, unknown>): RootState =>
  ({
    activeProtocol: {
      present: { ...protocol, ...overrides },
    },
    // No stage editor open, so nothing is in use by an unsaved draft.
    stageEditorDraft: { ui: { liveValues: null } },
  }) as unknown as RootState;

describe('issues selectors', () => {
  describe('getUnusedAssets()', () => {
    it('returns assets that are not referenced anywhere', () => {
      const result = getUnusedAssets(buildState());

      expect(result.count).toBe(1);
      expect(result.names).toEqual(['Unused image']);
    });

    it('returns an empty summary when every asset is used', () => {
      const result = getUnusedAssets(
        buildState({
          assetManifest: {
            asset1: { id: 'asset1', type: 'image', name: 'Used image' },
          },
        }),
      );

      expect(result.count).toBe(0);
      expect(result.names).toEqual([]);
    });
  });

  describe('getHasUnusedAssets()', () => {
    it('is true when there is at least one unused asset', () => {
      expect(getHasUnusedAssets(buildState())).toBe(true);
    });
  });

  describe('getUnusedVariables()', () => {
    it('returns variables that are not referenced anywhere', () => {
      const result = getUnusedVariables(buildState());

      expect(result.count).toBe(1);
      expect(result.names).toEqual(['Unused variable']);
    });
  });

  describe('getHasUnusedVariables()', () => {
    it('is true when there is at least one unused variable', () => {
      expect(getHasUnusedVariables(buildState())).toBe(true);
    });
  });

  describe('getUsesTestingMapboxToken()', () => {
    it('is true when an apikey asset holds the testing token', () => {
      const state = buildState({
        assetManifest: {
          token: {
            id: 'token',
            type: 'apikey',
            name: 'Mapbox token (testing only)',
            value: TESTING_MAPBOX_TOKEN,
          },
        },
      });

      expect(getUsesTestingMapboxToken(state)).toBe(true);
    });

    it('is false when an apikey asset holds a different token', () => {
      const state = buildState({
        assetManifest: {
          token: {
            id: 'token',
            type: 'apikey',
            name: 'My token',
            value: 'pk.some.other.token',
          },
        },
      });

      expect(getUsesTestingMapboxToken(state)).toBe(false);
    });

    it('is false when the protocol has no apikey assets', () => {
      const state = buildState({ assetManifest: {} });
      expect(getUsesTestingMapboxToken(state)).toBe(false);
    });

    it('is false for a retired testing token: the match is exact, not historical', () => {
      const state = buildState({
        assetManifest: {
          token: {
            id: 'token',
            type: 'apikey',
            name: 'Mapbox token (testing only)',
            value: buildMapboxToken(RETIRED_MAPBOX_TOKEN_IDS[0]),
          },
        },
      });

      expect(getUsesTestingMapboxToken(state)).toBe(false);
    });
  });

  describe('getUsesRetiredMapboxToken()', () => {
    // A protocol created from the template before the 2026-09-02 rotation
    // still carries the token that was revoked that day. Rebuilt from its id
    // at runtime so the revoked token is never written into the repository.
    const withApiKey = (value: string) =>
      buildState({
        assetManifest: {
          token: {
            id: 'token',
            type: 'apikey',
            name: 'Mapbox token (testing only)',
            value,
          },
        },
      });

    it('is true when an apikey asset holds a retired testing token', () => {
      expect(RETIRED_MAPBOX_TOKEN_IDS.length).toBeGreaterThan(0);
      for (const id of RETIRED_MAPBOX_TOKEN_IDS) {
        expect(
          getUsesRetiredMapboxToken(withApiKey(buildMapboxToken(id))),
        ).toBe(true);
      }
    });

    it('is false for a token of this account whose id is not retired', () => {
      const state = withApiKey(buildMapboxToken('cmnotretired000000000000'));

      expect(getUsesRetiredMapboxToken(state)).toBe(false);
      expect(getUsesTestingMapboxToken(state)).toBe(false);
    });

    it('is false for the current testing token', () => {
      expect(getUsesRetiredMapboxToken(withApiKey(TESTING_MAPBOX_TOKEN))).toBe(
        false,
      );
    });

    it('reports neither retired nor testing for a token that is neither', () => {
      const state = withApiKey('pk.some.other.token');

      expect(getUsesRetiredMapboxToken(state)).toBe(false);
      expect(getUsesTestingMapboxToken(state)).toBe(false);
    });

    it('ignores a retired token string on an asset that is not an apikey', () => {
      const state = buildState({
        assetManifest: {
          note: {
            id: 'note',
            type: 'image',
            name: 'Not a key',
            value: buildMapboxToken(RETIRED_MAPBOX_TOKEN_IDS[0]),
          },
        },
      });

      expect(getUsesRetiredMapboxToken(state)).toBe(false);
    });

    it('is false when the protocol has no apikey assets', () => {
      expect(getUsesRetiredMapboxToken(buildState({ assetManifest: {} }))).toBe(
        false,
      );
    });
  });
});
