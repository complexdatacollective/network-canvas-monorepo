import { describe, expect, it } from 'vitest';

import { parseIssues } from '../../../__tests__/schemaIssues.ts';
import {
  testId,
  testVariableId,
  withTestCodebookIds,
} from '../../../__tests__/testIds.ts';
import { localized } from '../../../utils/test-utils.ts';
import { assetSchema } from '../assets/index.ts';
import { CodebookSchema } from '../codebook/codebook.ts';
import { panelSchema } from '../common/panels.ts';
import { FilterSchema } from '../filters/index.ts';
import { anonymisationStage } from '../stages/anonymisation.ts';
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

describe('Sociogram edges.create + highlight.allowHighlighting (#673)', () => {
  const baseStage = {
    id: testId('soc1'),
    label: localized('Sociogram'),
    type: 'Sociogram' as const,
    subject: { entity: 'node' as const, types: ['person'] },
    layout: 'pos',
    background: { concentricCircles: 4 },
  };

  it('accepts a prompt with only edges.create set', () => {
    const result = sociogramStage.safeParse({
      ...baseStage,
      prompts: [
        {
          id: testId('p1'),
          text: localized('Connect'),
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
          id: testId('p1'),
          text: localized('Highlight'),
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
          id: testId('p1'),
          text: localized('Both'),
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
          id: testId('p1'),
          text: localized('Create only'),
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
          id: testId('p1'),
          text: localized('Highlight'),
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
          id: testId('p1'),
          text: localized('Edges'),
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
          id: testId('p1'),
          text: localized('Edges'),
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
      id: testId('soc1'),
      label: localized('Sociogram'),
      type: 'Sociogram' as const,
      subject: { entity: 'node' as const, types: ['person'] },
      layout: 'pos',
      background: { image: '' },
      prompts: [
        {
          id: testId('p1'),
          text: localized('Position'),
        },
      ],
    });
    expect(parseIssues(result)).toEqual([
      { path: 'background.image', code: 'too_small' },
    ]);
  });
});

describe('Geospatial targetFeatureProperty (#674)', () => {
  const baseStage = {
    id: testId('geo1'),
    label: localized('Geospatial'),
    type: 'Geospatial' as const,
    outsideAreasLabel: localized('Outside Selectable Areas'),
    subject: { entity: 'node' as const, types: ['person'] },
    prompts: [
      { id: testId('p1'), text: localized('Pick a place'), variable: 'home' },
    ],
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
    expect(parseIssues(result)).toEqual([
      { path: 'mapOptions.targetFeatureProperty', code: 'too_small' },
    ]);
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
    expect(parseIssues(result)).toEqual([{ path: 'value', code: 'too_small' }]);
  });
});

describe('Information content', () => {
  const baseStage = {
    id: testId('info1'),
    label: localized('Information'),
    type: 'Information' as const,
  };

  it('accepts a page of one markdown text', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      content: localized('# Welcome\n\nSome text'),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a page with many paragraphs (no upper bound)', () => {
    const content = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}`).join(
      '\n\n',
    );
    const result = informationStage.safeParse({
      ...baseStage,
      content: localized(content),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a page with no content', () => {
    const result = informationStage.safeParse(baseStage);
    expect(parseIssues(result)).toEqual([
      { path: 'content', code: 'invalid_type' },
    ]);
  });

  it('rejects empty content', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      content: localized(''),
    });
    expect(parseIssues(result)).toEqual([
      { path: 'content.en', code: 'too_small' },
    ]);
  });

  // The heading and the files are part of the text, so the title and items
  // schema 8 had are refused.
  it('rejects the separate title and items schema 8 had', () => {
    const result = informationStage.safeParse({
      ...baseStage,
      content: localized('Some text'),
      title: localized('Information'),
      items: [{ id: 'i1', type: 'text', content: localized('Some text') }],
    });
    expect(parseIssues(result)).toEqual([
      { path: '', code: 'unrecognized_keys', keys: ['title', 'items'] },
    ]);
  });
});

describe('Anonymisation explanationText non-empty', () => {
  const baseStage = {
    id: testId('anon1'),
    label: localized('Anonymisation'),
    type: 'Anonymisation' as const,
    explanationText: localized(
      '# Why we do this\n\nYour responses are encrypted.',
    ),
  };

  it('accepts a non-empty explanationText', () => {
    expect(anonymisationStage.safeParse(baseStage).success).toBe(true);
  });

  it('rejects an empty explanationText', () => {
    expect(
      parseIssues(
        anonymisationStage.safeParse({
          ...baseStage,
          explanationText: localized(''),
        }),
      ),
    ).toEqual([{ path: 'explanationText.en', code: 'too_small' }]);
  });

  // The heading is part of the text, so the title it replaced is refused.
  it('rejects the separate title and body schema 8 had', () => {
    expect(
      parseIssues(
        anonymisationStage.safeParse({
          ...baseStage,
          explanationText: {
            title: localized('Why we do this'),
            body: localized('Your responses are encrypted.'),
          },
        }),
      ),
    ).toEqual([
      { path: 'explanationText.body', code: 'invalid_type' },
      { path: 'explanationText.title', code: 'invalid_type' },
    ]);
  });
});

describe('Narrative preset label non-empty', () => {
  const baseStage = {
    id: testId('narr1'),
    label: localized('Narrative'),
    type: 'Narrative' as const,
    subject: { entity: 'node' as const, types: ['person'] },
    background: { concentricCircles: 4 },
  };

  it('accepts a preset with a non-empty label', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      presets: [
        {
          id: testId('preset1'),
          label: localized('Overview'),
          layout: 'pos',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a preset with an empty label', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      presets: [{ id: testId('preset1'), label: localized(''), layout: 'pos' }],
    });
    expect(parseIssues(result)).toEqual([
      { path: 'presets.0.label.en', code: 'too_small' },
    ]);
  });

  it('accepts an image background', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      background: { image: 'background-image' },
      presets: [
        {
          id: testId('preset1'),
          label: localized('Overview'),
          layout: 'pos',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a background with both an image and concentric circles', () => {
    const result = narrativeStage.safeParse({
      ...baseStage,
      background: { image: 'background-image', concentricCircles: 4 },
      presets: [
        {
          id: testId('preset1'),
          label: localized('Overview'),
          layout: 'pos',
        },
      ],
    });
    expect(parseIssues(result)).toEqual([
      {
        path: 'background.concentricCircles',
        code: 'custom',
        message:
          'concentricCircles cannot be set when background has an image.',
      },
    ]);
  });
});

describe('Side panel title and dataSource non-empty', () => {
  const basePanel = {
    id: testId('panel1'),
    dataSource: 'existing' as const,
    title: localized('Previous alters'),
  };

  it('accepts a panel with a non-empty title', () => {
    expect(panelSchema.safeParse(basePanel).success).toBe(true);
  });

  it('rejects a panel with an empty title', () => {
    expect(
      parseIssues(
        panelSchema.safeParse({ ...basePanel, title: localized('') }),
      ),
    ).toEqual([{ path: 'title.en', code: 'too_small' }]);
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
    id: testId('ngr1'),
    label: localized('Roster'),
    type: 'NameGeneratorRoster' as const,
    allAddedNotice: localized('There is nothing left to add from this list.'),
    unnamedLabel: localized('Unnamed {count}'),
    subject: { entity: 'node' as const, types: ['person'] },
    dataSource: 'roster-asset',
    panelTitle: localized('Available to add'),
    prompts: [{ id: testId('p1'), text: localized('Pick someone') }],
  };

  it('accepts a non-empty dataSource', () => {
    expect(nameGeneratorRosterStage.safeParse(baseStage).success).toBe(true);
  });

  it('rejects an empty dataSource', () => {
    expect(
      parseIssues(
        nameGeneratorRosterStage.safeParse({ ...baseStage, dataSource: '' }),
      ),
    ).toEqual([{ path: 'dataSource', code: 'too_small' }]);
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
      parseIssues(
        nameGeneratorRosterStage.safeParse({
          ...baseStage,
          searchOptions: { fuzziness: 0.5, matchProperties: [] },
        }),
      ),
    ).toEqual([{ path: 'searchOptions.matchProperties', code: 'too_small' }]);
  });
});

// A codebook written with readable keys, with `testTypeId` and `testVariableId`
// ids: one variable key on two entities becomes one id on both.
const parseCodebook = (codebook: Record<string, unknown>) =>
  CodebookSchema.safeParse(withTestCodebookIds({ codebook }).codebook);

describe('Codebook cross-entity record-key collision (#663)', () => {
  it('accepts the same record key reused within compatible definitions across entities only when distinct keys', () => {
    const result = parseCodebook({
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            v1: { name: 'Age', type: 'number' },
          },
        },
      },
      edge: {
        family: {
          name: 'Family',
          variables: {
            v2: {
              name: 'Closeness',
              type: 'number',
            },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a variable record key reused across a node and an edge type', () => {
    const result = parseCodebook({
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Age', type: 'number' },
          },
        },
      },
      edge: {
        family: {
          name: 'Family',
          variables: {
            shared: {
              name: 'Weight',
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
    const result = parseCodebook({
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Age', type: 'number' },
          },
        },
        place: {
          name: 'Place',
          color: 'node-color-seq-2',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Label', type: 'text' },
          },
        },
      },
    });
    expect(parseIssues(result)).toEqual([
      {
        path: '',
        code: 'custom',
        message: `Attribute record key "${testVariableId('shared')}" is reused across entity types`,
      },
    ]);
  });

  it('rejects a variable record key reused across a node type and ego', () => {
    const result = parseCodebook({
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            shared: { name: 'Age', type: 'number' },
          },
        },
      },
      ego: {
        variables: {
          shared: {
            name: 'Income',
            type: 'number',
          },
        },
      },
    });
    expect(parseIssues(result)).toEqual([
      {
        path: '',
        code: 'custom',
        message: `Attribute record key "${testVariableId('shared')}" is reused across entity types`,
      },
    ]);
  });
});

describe('Empty-rules filter (#669)', () => {
  const rule = {
    type: 'node' as const,
    id: testId('r1'),
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
      rules: [rule, { ...rule, id: testId('r2') }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a filter with an empty rules array', () => {
    const result = FilterSchema.safeParse({ rules: [] });
    expect(parseIssues(result)).toEqual([{ path: 'rules', code: 'too_small' }]);
  });

  it('rejects a multiple-join filter with an empty rules array', () => {
    const result = FilterSchema.safeParse({ join: 'AND', rules: [] });
    expect(parseIssues(result)).toEqual([{ path: 'rules', code: 'too_small' }]);
  });
});
