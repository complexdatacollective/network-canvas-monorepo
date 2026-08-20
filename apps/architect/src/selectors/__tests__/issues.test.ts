import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';
import { TESTING_MAPBOX_TOKEN } from '~/templates/testingMapboxToken';

import {
  getHasUnusedAssets,
  getHasUnusedVariables,
  getUnusedAssets,
  getUnusedVariables,
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
  });
});
