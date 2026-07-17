import { describe, expect, it } from 'vitest';

import { createBaseProtocol } from '../../../utils/test-utils.ts';
import ProtocolSchemaV8 from '../schema.ts';

/**
 * Cross-reference conformance for refinements that cannot be expressed in the
 * static schema: asset-manifest references, prompt-variable type binding, and
 * filter-rule operator/value/ego constraints across every filter location.
 */
describe('Cross-reference conformance', () => {
  describe('Canvas background image assets', () => {
    const narrativeProtocol = (
      image: string,
      assetManifest?: Record<string, unknown>,
    ) => {
      const base = createBaseProtocol();
      return {
        ...base,
        ...(assetManifest ? { assetManifest } : {}),
        stages: [
          {
            id: 'narrative1',
            type: 'Narrative',
            label: 'Narrative',
            subject: { entity: 'node', type: 'person' },
            background: { image },
            presets: [
              {
                id: 'preset1',
                label: 'Overview',
                layoutVariable: 'layoutPosition',
              },
            ],
          },
        ],
      };
    };

    it('accepts a Narrative background referencing an image asset', () => {
      const result = ProtocolSchemaV8.safeParse(
        narrativeProtocol('background-image', {
          'background-image': {
            id: 'background-image',
            type: 'image',
            name: 'Background',
            source: 'background.svg',
          },
        }),
      );
      expect(result.success).toBe(true);
    });

    it('rejects a Narrative background absent from the manifest', () => {
      const result = ProtocolSchemaV8.safeParse(
        narrativeProtocol('missing-image'),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((candidate) =>
          candidate.message.includes(
            'Canvas background image "missing-image" does not reference an asset in the manifest.',
          ),
        );
        expect(issue?.path).toEqual(['stages', 0, 'background', 'image']);
      }
    });

    it('rejects a Narrative background referencing a non-image asset', () => {
      const result = ProtocolSchemaV8.safeParse(
        narrativeProtocol('roster-asset', {
          'roster-asset': {
            id: 'roster-asset',
            type: 'network',
            name: 'Roster',
            source: 'roster.csv',
          },
        }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((candidate) =>
          candidate.message.includes(
            `Canvas background image "roster-asset" must reference an 'image' asset`,
          ),
        );
        expect(issue?.path).toEqual(['stages', 0, 'background', 'image']);
      }
    });
  });

  describe('NameGeneratorRoster dataSource', () => {
    const rosterProtocol = (dataSource: string) => {
      const base = createBaseProtocol();
      return {
        ...base,
        assetManifest: {
          networkAsset: {
            id: 'networkAsset',
            type: 'network' as const,
            name: 'roster.csv',
            source: 'roster.csv',
          },
          imageAsset: {
            id: 'imageAsset',
            type: 'image' as const,
            name: 'logo.png',
            source: 'logo.png',
          },
        },
        stages: [
          {
            id: 'roster1',
            type: 'NameGeneratorRoster',
            label: 'Roster',
            subject: { entity: 'node', type: 'person' },
            dataSource,
            prompts: [{ id: 'p1', text: 'Pick someone' }],
          },
        ],
      };
    };

    it('accepts a dataSource referencing a network asset (control)', () => {
      const result = ProtocolSchemaV8.safeParse(rosterProtocol('networkAsset'));
      expect(result.success).toBe(true);
    });

    it('rejects dataSource referencing a non-network asset type', () => {
      const result = ProtocolSchemaV8.safeParse(rosterProtocol('imageAsset'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('network')),
        ).toBe(true);
      }
    });

    it("rejects dataSource of 'existing'", () => {
      const result = ProtocolSchemaV8.safeParse(rosterProtocol('existing'));
      expect(result.success).toBe(false);
    });

    it('rejects dataSource referencing a missing asset id', () => {
      const result = ProtocolSchemaV8.safeParse(rosterProtocol('missingId'));
      expect(result.success).toBe(false);
    });
  });

  describe('Geospatial asset and prompt cross-references', () => {
    const geoProtocol = (overrides: {
      tokenAssetId?: string;
      dataSourceAssetId?: string;
      promptVariable?: string;
    }) => {
      const base = createBaseProtocol();
      return {
        ...base,
        codebook: {
          ...base.codebook,
          node: {
            ...base.codebook.node,
            person: {
              ...base.codebook.node.person,
              variables: {
                ...base.codebook.node.person.variables,
                homeLocation: { name: 'Home', type: 'location' },
              },
            },
          },
        },
        assetManifest: {
          tokenAsset: {
            id: 'tokenAsset',
            type: 'apikey' as const,
            name: 'k',
            value: 'pk.abc',
          },
          geoAsset: {
            id: 'geoAsset',
            type: 'geojson' as const,
            name: 'map.geojson',
            source: 'map.geojson',
          },
        },
        stages: [
          {
            id: 'geo1',
            type: 'Geospatial',
            label: 'Map',
            subject: { entity: 'node', type: 'person' },
            mapOptions: {
              tokenAssetId: overrides.tokenAssetId ?? 'tokenAsset',
              style: 'mapbox://styles/mapbox/standard',
              center: [0, 0],
              initialZoom: 5,
              dataSourceAssetId: overrides.dataSourceAssetId ?? 'geoAsset',
              color: 'node-color-seq-1',
              targetFeatureProperty: 'name',
            },
            prompts: [
              {
                id: 'gp1',
                text: 'Pick a place',
                variable: overrides.promptVariable ?? 'homeLocation',
              },
            ],
          },
        ],
      };
    };

    it('accepts correct asset references and a location prompt variable (control)', () => {
      const result = ProtocolSchemaV8.safeParse(geoProtocol({}));
      expect(result.success).toBe(true);
    });

    it('rejects tokenAssetId that is missing from the manifest', () => {
      const result = ProtocolSchemaV8.safeParse(
        geoProtocol({ tokenAssetId: 'missing' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects tokenAssetId resolving to a non-apikey asset', () => {
      const result = ProtocolSchemaV8.safeParse(
        geoProtocol({ tokenAssetId: 'geoAsset' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects dataSourceAssetId that is missing from the manifest', () => {
      const result = ProtocolSchemaV8.safeParse(
        geoProtocol({ dataSourceAssetId: 'missing' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects dataSourceAssetId resolving to an apikey asset', () => {
      const result = ProtocolSchemaV8.safeParse(
        geoProtocol({ dataSourceAssetId: 'tokenAsset' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects a geospatial prompt variable that is not type location', () => {
      const result = ProtocolSchemaV8.safeParse(
        geoProtocol({ promptVariable: 'age' }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('location')),
        ).toBe(true);
      }
    });
  });

  describe('Bin prompt variable types', () => {
    it('accepts an OrdinalBin prompt bound to an ordinal variable (control)', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'ob1',
            type: 'OrdinalBin',
            label: 'Ordinal',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'rank',
                variable: 'strength',
                color: 'ord-color-seq-1',
              },
            ],
          },
        ],
      };
      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });

    it('rejects an OrdinalBin prompt bound to a non-ordinal variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'ob1',
            type: 'OrdinalBin',
            label: 'Ordinal',
            subject: { entity: 'node', type: 'person' },
            prompts: [
              {
                id: 'p1',
                text: 'rank',
                variable: 'category',
                color: 'ord-color-seq-1',
              },
            ],
          },
        ],
      };
      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('ordinal')),
        ).toBe(true);
      }
    });

    it('accepts a CategoricalBin prompt bound to a categorical variable (control)', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'cb1',
            type: 'CategoricalBin',
            label: 'Categorical',
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'p1', text: 'group', variable: 'category' }],
          },
        ],
      };
      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });

    it('rejects a CategoricalBin prompt bound to a non-categorical variable', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            id: 'cb1',
            type: 'CategoricalBin',
            label: 'Categorical',
            subject: { entity: 'node', type: 'person' },
            prompts: [{ id: 'p1', text: 'group', variable: 'strength' }],
          },
        ],
      };
      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) => i.message.includes('categorical')),
        ).toBe(true);
      }
    });
  });

  describe('Operator/value-type validation across filter locations', () => {
    const stageWith = (filterLocation: 'skipLogic' | 'panel') => {
      const base = createBaseProtocol();
      // numeric operator (GREATER_THAN) with a string value is invalid for a
      // number variable — should be caught wherever the filter lives.
      const badFilter = {
        join: 'OR' as const,
        rules: [
          {
            id: 'r1',
            type: 'node' as const,
            options: {
              type: 'person',
              attribute: 'age',
              operator: 'GREATER_THAN' as const,
              value: 'not-a-number',
            },
          },
        ],
      };

      if (filterLocation === 'skipLogic') {
        return {
          ...base,
          stages: [
            {
              ...base.stages[0],
              skipLogic: { action: 'SHOW' as const, filter: badFilter },
            },
          ],
        };
      }

      return {
        ...base,
        stages: [
          {
            id: 'panelStage',
            type: 'NameGenerator',
            label: 'Panels',
            subject: { entity: 'node', type: 'person' },
            form: {
              title: 'Add person',
              fields: [{ variable: 'name', prompt: 'Enter name' }],
            },
            prompts: [{ id: 'p1', text: 'who' }],
            panels: [
              {
                id: 'panel1',
                title: 'Panel',
                dataSource: 'existing',
                filter: badFilter,
              },
            ],
          },
        ],
      };
    };

    it('rejects a numeric operator with a string value in skipLogic.filter', () => {
      const result = ProtocolSchemaV8.safeParse(stageWith('skipLogic'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            i.message.includes('requires a numeric value'),
          ),
        ).toBe(true);
      }
    });

    it('rejects a numeric operator with a string value in a panel filter', () => {
      const result = ProtocolSchemaV8.safeParse(stageWith('panel'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            i.message.includes('requires a numeric value'),
          ),
        ).toBe(true);
      }
    });
  });

  describe('Ego rules in stage node/edge filters', () => {
    const stageFilterRule = (ruleType: 'node' | 'ego') => {
      const base = createBaseProtocol();
      return {
        ...base,
        stages: [
          {
            id: 'sociogram1',
            type: 'Sociogram',
            label: 'Sociogram',
            subject: { entity: 'node', type: 'person' },
            background: { concentricCircles: 4 },
            filter: {
              join: 'OR' as const,
              rules: [
                {
                  id: 'r1',
                  type: ruleType,
                  options: {
                    ...(ruleType === 'node' ? { type: 'person' } : {}),
                    attribute: ruleType === 'ego' ? 'egoName' : 'name',
                    operator: 'EXISTS' as const,
                  },
                },
              ],
            },
            prompts: [
              {
                id: 'socPrompt1',
                text: 'Position nodes',
                layout: { layoutVariable: 'layoutPosition' },
              },
            ],
          },
        ],
      };
    };

    it('accepts a node rule in a stage filter (control)', () => {
      const result = ProtocolSchemaV8.safeParse(stageFilterRule('node'));
      expect(result.success).toBe(true);
    });

    it('rejects an ego rule inside a stage node/edge filter', () => {
      const result = ProtocolSchemaV8.safeParse(stageFilterRule('ego'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            i.message.toLowerCase().includes('ego'),
          ),
        ).toBe(true);
      }
    });

    it('accepts an ego rule inside skipLogic.filter', () => {
      const base = createBaseProtocol();
      const protocol = {
        ...base,
        stages: [
          {
            ...base.stages[0],
            skipLogic: {
              action: 'SHOW' as const,
              filter: {
                join: 'OR' as const,
                rules: [
                  {
                    id: 'r1',
                    type: 'ego' as const,
                    options: {
                      attribute: 'egoName',
                      operator: 'EXISTS' as const,
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      const result = ProtocolSchemaV8.safeParse(protocol);
      expect(result.success).toBe(true);
    });
  });

  describe('Attribute-less ego type-level rules', () => {
    const egoTypeRuleProtocol = (withAttribute: boolean) => {
      const base = createBaseProtocol();
      return {
        ...base,
        stages: [
          {
            ...base.stages[0],
            skipLogic: {
              action: 'SHOW' as const,
              filter: {
                join: 'OR' as const,
                rules: [
                  withAttribute
                    ? {
                        id: 'r1',
                        type: 'ego' as const,
                        options: {
                          attribute: 'egoName',
                          operator: 'EXISTS' as const,
                        },
                      }
                    : {
                        id: 'r1',
                        type: 'ego' as const,
                        options: { operator: 'EXISTS' as const },
                      },
                ],
              },
            },
          },
        ],
      };
    };

    it('accepts an ego attribute-level EXISTS rule in skipLogic (control)', () => {
      const result = ProtocolSchemaV8.safeParse(egoTypeRuleProtocol(true));
      expect(result.success).toBe(true);
    });

    it('rejects an attribute-less ego type-level rule', () => {
      const result = ProtocolSchemaV8.safeParse(egoTypeRuleProtocol(false));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            i.message.toLowerCase().includes('ego'),
          ),
        ).toBe(true);
      }
    });
  });
});
