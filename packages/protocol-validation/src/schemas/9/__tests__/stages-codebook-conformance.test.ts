import { describe, expect, it } from 'vitest';

import { localized } from '../../../utils/test-utils.ts';
import { assetSchema } from '../assets/index.ts';
import { CodebookSchema } from '../codebook/codebook.ts';
import { panelSchema } from '../common/panels.ts';
import { FilterSchema } from '../filters/index.ts';
import { anonymisationStage } from '../stages/anonymisation.ts';
import { familyPedigreeStage } from '../stages/family-pedigree.ts';
import { geospatialStage } from '../stages/geospatial.ts';
import { informationStage } from '../stages/information.ts';
import { nameGeneratorRosterStage } from '../stages/name-generator-roster.ts';
import { narrativeStage } from '../stages/narrative.ts';
import { sociogramStage } from '../stages/sociogram.ts';

/**
 * Schema-conformance tests for the stage/codebook/filter/asset schemas owned by
 * this cluster. These exercise the individual schemas directly (not the
 * top-level ProtocolSchemaV9) so they document the structural constraints each
 * schema enforces on its own.
 */

describe('FamilyPedigree nomination prompts (#664)', () => {
  const baseStage = {
    id: 'fp1',
    label: localized('Family Pedigree'),
    type: 'FamilyPedigree' as const,
    nodeConfig: {
      type: 'person',
      nodeLabelVariable: 'label',
      egoVariable: 'isEgo',
      relationshipVariable: 'rel',
      biologicalSexVariable: 'bioSex',
    },
    edgeConfig: {
      type: 'family',
      relationshipTypeVariable: 'relType',
      isActiveVariable: 'isActive',
      isGestationalCarrierVariable: 'isGc',
      gameteRoleVariable: 'gameteRole',
    },
    censusPrompt: localized('Build your family'),
    framing: { mode: 'fixed' as const, value: 'gamete' as const },
    boundaries: {
      requireGrandparents: 'off' as const,
      requireChildrenContributors: 'off' as const,
    },
  };

  it('accepts nomination prompts with distinct, non-reserved ids', () => {
    const result = familyPedigreeStage.safeParse({
      ...baseStage,
      nominationPrompts: [
        { id: 'p1', text: localized('Who has the condition?'), variable: 'v1' },
        { id: 'p2', text: localized('Who else?'), variable: 'v2' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a nomination prompt using the reserved id 'scaffolding'", () => {
    const result = familyPedigreeStage.safeParse({
      ...baseStage,
      nominationPrompts: [
        {
          id: 'scaffolding',
          text: localized('Who has the condition?'),
          variable: 'v1',
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('scaffolding'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects duplicate nomination-prompt ids', () => {
    const result = familyPedigreeStage.safeParse({
      ...baseStage,
      nominationPrompts: [
        { id: 'dup', text: localized('First'), variable: 'v1' },
        { id: 'dup', text: localized('Second'), variable: 'v2' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.toLowerCase().includes('duplicate'),
      );
      expect(issue).toBeDefined();
    }
  });
});

describe('Sociogram edges.create + highlight.allowHighlighting (#673)', () => {
  const baseStage = {
    id: 'soc1',
    label: localized('Sociogram'),
    type: 'Sociogram' as const,
    subject: { entity: 'node' as const, type: 'person' },
    background: { concentricCircles: 4 },
  };

  it('accepts a prompt with only edges.create set', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: 'p1',
          text: localized('Connect'),
          layout: { layoutVariable: 'pos' },
          edges: { create: 'friend' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a prompt with only highlight.allowHighlighting set', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: 'p1',
          text: localized('Highlight'),
          layout: { layoutVariable: 'pos' },
          highlight: { allowHighlighting: true, variable: 'isClose' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a prompt with both edges.create and highlight.allowHighlighting set', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: 'p1',
          text: localized('Both'),
          layout: { layoutVariable: 'pos' },
          edges: { create: 'friend' },
          highlight: { allowHighlighting: true, variable: 'isClose' },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.toLowerCase().includes('highlight'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('accepts a prompt with edges.create and highlight present but allowHighlighting false', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: 'p1',
          text: localized('Create only'),
          layout: { layoutVariable: 'pos' },
          edges: { create: 'friend' },
          highlight: { allowHighlighting: false },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a prompt with allowHighlighting enabled but no highlight variable', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: 'p1',
          text: localized('Highlight'),
          layout: { layoutVariable: 'pos' },
          highlight: { allowHighlighting: true },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('highlight.variable is required'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects a prompt with an empty edges object', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: 'p1',
          text: localized('Edges'),
          layout: { layoutVariable: 'pos' },
          edges: {},
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('edges must set create'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects a prompt whose edges only set an empty display array', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: 'p1',
          text: localized('Edges'),
          layout: { layoutVariable: 'pos' },
          edges: { display: [] },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.includes('edges must set create'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects a background with an empty-string image', () => {
    const result = sociogramStage.safeParse({
      id: 'soc1',
      label: localized('Sociogram'),
      type: 'Sociogram' as const,
      subject: { entity: 'node' as const, type: 'person' },
      background: { image: '' },
      prompts: [
        {
          id: 'p1',
          text: localized('Position'),
          layout: { layoutVariable: 'pos' },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('Geospatial targetFeatureProperty (#674)', () => {
  const baseStage = {
    id: 'geo1',
    label: localized('Geospatial'),
    type: 'Geospatial' as const,
    subject: { entity: 'node' as const, type: 'person' },
    prompts: [{ id: 'p1', text: localized('Pick a place'), variable: 'home' }],
  };

  const baseMapOptions = {
    tokenAssetId: 'token',
    style: 'mapbox://styles/mapbox/standard',
    center: [0, 0] as [number, number],
    initialZoom: 5,
    dataSourceAssetId: 'data',
    color: 'ord-color-seq-1',
  };

  it('accepts a non-empty targetFeatureProperty', () => {
    const result = geospatialStage.safeParse({
      ...baseStage,
      mapOptions: { ...baseMapOptions, targetFeatureProperty: 'name' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty targetFeatureProperty', () => {
    const result = geospatialStage.safeParse({
      ...baseStage,
      mapOptions: { ...baseMapOptions, targetFeatureProperty: '' },
    });
    expect(result.success).toBe(false);
  });
});

describe('apikey asset value (#674)', () => {
  it('accepts an apikey asset with a non-empty value', () => {
    const result = assetSchema.safeParse({
      id: 'token',
      name: 'Mapbox Token',
      type: 'apikey',
      value: 'pk.abc123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an apikey asset with an empty value', () => {
    const result = assetSchema.safeParse({
      id: 'token',
      name: 'Mapbox Token',
      type: 'apikey',
      value: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('Information size and items (#676)', () => {
  const baseStage = {
    id: 'info1',
    label: localized('Information'),
    type: 'Information' as const,
    title: localized('Information'),
  };

  it('accepts an asset item with an uppercase size enum value', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [{ id: 'i1', type: 'asset', content: 'img-1', size: 'LARGE' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a lowercase size value', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [{ id: 'i1', type: 'asset', content: 'img-1', size: 'large' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unsupported size value', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [{ id: 'i1', type: 'asset', content: 'img-1', size: 'XL' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects size on a text item', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [
        {
          id: 'i1',
          type: 'text',
          content: localized('Some text'),
          size: 'SMALL',
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a text item with no size', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [{ id: 'i1', type: 'text', content: localized('Some text') }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an Information stage with many items (no upper bound)', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `i${i}`,
      type: 'text' as const,
      content: localized(`Paragraph ${i}`),
    }));
    const result = informationStage.safeParse({ ...baseStage, items });
    expect(result.success).toBe(true);
  });
});

describe('Information item content non-empty', () => {
  const baseStage = {
    id: 'info1',
    label: localized('Information'),
    type: 'Information' as const,
    title: localized('Information'),
  };

  it('rejects a text item with empty content', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [{ id: 'i1', type: 'text', content: localized('') }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an asset item with empty content', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [{ id: 'i1', type: 'asset', content: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts text and asset items with non-empty content', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      items: [
        { id: 'i1', type: 'text', content: localized('Some text') },
        { id: 'i2', type: 'asset', content: 'img-1' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('Anonymisation explanationText non-empty', () => {
  const baseStage = {
    id: 'anon1',
    label: localized('Anonymisation'),
    type: 'Anonymisation' as const,
    explanationText: {
      title: localized('Why we do this'),
      body: localized('Your responses are encrypted.'),
    },
  };

  it('accepts non-empty explanationText title and body', () => {
    expect(anonymisationStage.safeParse(baseStage).success).toBe(true);
  });

  it('rejects an empty explanationText title', () => {
    expect(
      anonymisationStage.safeParse({
        ...baseStage,
        explanationText: {
          title: localized(''),
          body: localized('Your responses are encrypted.'),
        },
      }).success,
    ).toBe(false);
  });

  it('rejects an empty explanationText body', () => {
    expect(
      anonymisationStage.safeParse({
        ...baseStage,
        explanationText: {
          title: localized('Why we do this'),
          body: localized(''),
        },
      }).success,
    ).toBe(false);
  });
});

describe('Narrative preset label non-empty', () => {
  const baseStage = {
    id: 'narr1',
    label: localized('Narrative'),
    type: 'Narrative' as const,
    subject: { entity: 'node' as const, type: 'person' },
    background: { concentricCircles: 4 },
  };

  it('accepts a preset with a non-empty label', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      presets: [
        { id: 'preset1', label: localized('Overview'), layoutVariable: 'pos' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a preset with an empty label', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      presets: [{ id: 'preset1', label: localized(''), layoutVariable: 'pos' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an image background', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      background: { image: 'background-image' },
      presets: [
        { id: 'preset1', label: localized('Overview'), layoutVariable: 'pos' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a background with both an image and concentric circles', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      background: { image: 'background-image', concentricCircles: 4 },
      presets: [
        { id: 'preset1', label: localized('Overview'), layoutVariable: 'pos' },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('Side panel title and dataSource non-empty', () => {
  const basePanel = {
    id: 'panel1',
    dataSource: 'existing' as const,
    title: localized('Previous alters'),
  };

  it('accepts a panel with a non-empty title', () => {
    expect(panelSchema.safeParse(basePanel).success).toBe(true);
  });

  it('rejects a panel with an empty title', () => {
    expect(
      panelSchema.safeParse({ ...basePanel, title: localized('') }).success,
    ).toBe(false);
  });

  it('rejects an empty panel dataSource', () => {
    // A panel's `dataSource` is either the literal 'existing' (the current
    // network) or an asset id. An empty string is neither: it names no roster
    // to draw from, so the panel renders nothing at all.
    const result = panelSchema.safeParse({ ...basePanel, dataSource: '' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues).toContainEqual(
      expect.objectContaining({
        message: 'Too small: expected string to have >=1 characters',
        path: ['dataSource'],
      }),
    );
  });

  it('accepts a panel whose dataSource names an asset', () => {
    expect(
      panelSchema.safeParse({ ...basePanel, dataSource: 'roster-asset' })
        .success,
    ).toBe(true);
  });
});

describe('NameGeneratorRoster dataSource and matchProperties non-empty', () => {
  const baseStage = {
    id: 'ngr1',
    label: localized('Roster'),
    type: 'NameGeneratorRoster' as const,
    subject: { entity: 'node' as const, type: 'person' },
    dataSource: 'roster-asset',
    prompts: [{ id: 'p1', text: localized('Pick someone') }],
  };

  it('accepts a non-empty dataSource', () => {
    expect(nameGeneratorRosterStage.safeParse(baseStage).success).toBe(true);
  });

  it('rejects an empty dataSource', () => {
    expect(
      nameGeneratorRosterStage.safeParse({ ...baseStage, dataSource: '' })
        .success,
    ).toBe(false);
  });

  it('accepts searchOptions with at least one matchProperty', () => {
    expect(
      nameGeneratorRosterStage.safeParse({
        ...baseStage,
        searchOptions: { fuzziness: 0.5, matchProperties: ['name'] },
      }).success,
    ).toBe(true);
  });

  it('rejects searchOptions with an empty matchProperties array', () => {
    expect(
      nameGeneratorRosterStage.safeParse({
        ...baseStage,
        searchOptions: { fuzziness: 0.5, matchProperties: [] },
      }).success,
    ).toBe(false);
  });
});

describe('Codebook cross-entity record-key collision (#663)', () => {
  it('accepts the same record key reused within compatible definitions across entities only when distinct keys', () => {
    const result = CodebookSchema.safeParse({
      node: {
        person: {
          name: 'Person',
          label: localized('Person'),
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            v1: { name: 'Age', label: 'Age', type: 'number' },
          },
        },
      },
      edge: {
        family: {
          name: 'Family',
          label: localized('Family'),
          variables: {
            v2: {
              name: 'Closeness',
              label: 'Closeness',
              type: 'number',
            },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a variable record key reused across a node and an edge type', () => {
    const result = CodebookSchema.safeParse({
      node: {
        person: {
          name: 'Person',
          label: localized('Person'),
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Age', label: 'Age', type: 'number' },
          },
        },
      },
      edge: {
        family: {
          name: 'Family',
          label: localized('Family'),
          variables: {
            shared: {
              name: 'Weight',
              label: 'Weight',
              type: 'text',
            },
          },
        },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.message.toLowerCase().includes('record key'),
      );
      expect(issue).toBeDefined();
    }
  });

  it('rejects a variable record key reused across two node types', () => {
    const result = CodebookSchema.safeParse({
      node: {
        person: {
          name: 'Person',
          label: localized('Person'),
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Age', label: 'Age', type: 'number' },
          },
        },
        place: {
          name: 'Place',
          label: localized('Place'),
          color: 'node-color-seq-2',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Label', label: 'Label', type: 'text' },
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a variable record key reused across a node type and ego', () => {
    const result = CodebookSchema.safeParse({
      node: {
        person: {
          name: 'Person',
          label: localized('Person'),
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Age', label: 'Age', type: 'number' },
          },
        },
      },
      ego: {
        variables: {
          shared: {
            name: 'Income',
            label: 'Income',
            type: 'number',
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('Empty-rules filter (#669)', () => {
  const rule = {
    type: 'node' as const,
    id: 'r1',
    options: {
      type: 'person',
      attribute: 'age',
      operator: 'EXACTLY' as const,
      value: 5,
    },
  };

  it('accepts a single-rule filter with one rule', () => {
    const result = FilterSchema.safeParse({ join: 'OR', rules: [rule] });
    expect(result.success).toBe(true);
  });

  it('accepts a multiple-rule filter with two rules', () => {
    const result = FilterSchema.safeParse({
      join: 'AND',
      rules: [rule, { ...rule, id: 'r2' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a filter with an empty rules array', () => {
    const result = FilterSchema.safeParse({ rules: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a multiple-join filter with an empty rules array', () => {
    const result = FilterSchema.safeParse({ join: 'AND', rules: [] });
    expect(result.success).toBe(false);
  });
});
