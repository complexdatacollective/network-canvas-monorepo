import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { analyseStageEffects } from '../stageEffects';

// Analysis operates on already-validated stages; tests build minimal shapes.
const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const nodeSubject = { entity: 'node', type: 'person' };

describe('analyseStageEffects', () => {
  it('summarises a NameGenerator: capacity, form writes, prompt fixed values', () => {
    const effects = analyseStageEffects([
      stage({
        id: 's1',
        type: 'NameGenerator',
        label: 'Names',
        subject: nodeSubject,
        form: { title: 'Add', fields: [{ variable: 'name', prompt: 'Name?' }] },
        behaviours: { minNodes: 2, maxNodes: 6 },
        prompts: [
          {
            id: 'p1',
            text: 'Who?',
            additionalAttributes: [{ variable: 'close', value: true }],
          },
          { id: 'p2', text: 'Anyone else?' },
        ],
      }),
    ]);
    const [summary] = effects.stages;
    expect(summary?.nodeCreations).toEqual([
      {
        stageIndex: 0,
        nodeType: 'person',
        source: 'fabricated',
        capacity: { min: 2, max: 6 },
        writesAtCreation: ['name'],
        promptFixedValues: [{ close: true }, {}],
      },
    ]);
    expect(effects.creatableNodeTypes).toEqual(new Set(['person']));
  });

  it('defaults capacity to an open window without behaviours', () => {
    const effects = analyseStageEffects([
      stage({
        id: 's1',
        type: 'NameGeneratorQuickAdd',
        label: 'Quick',
        subject: nodeSubject,
        quickAdd: 'nickname',
        prompts: [{ id: 'p1', text: 'Who?' }],
      }),
    ]);
    expect(effects.stages[0]?.nodeCreations[0]).toMatchObject({
      source: 'fabricated',
      capacity: { min: 0, max: null },
      writesAtCreation: ['nickname'],
    });
  });

  it('marks a roster stage and carries its stage id for externalData lookup', () => {
    const effects = analyseStageEffects([
      stage({
        id: 'roster-1',
        type: 'NameGeneratorRoster',
        label: 'Roster',
        subject: nodeSubject,
        dataSource: 'people.csv',
        prompts: [{ id: 'p1', text: 'Pick' }],
      }),
    ]);
    expect(effects.stages[0]?.nodeCreations[0]).toMatchObject({
      source: 'roster',
      rosterStageId: 'roster-1',
      writesAtCreation: [],
    });
  });

  it('gives sociogram prompts layout, highlight, and edge-creation effects', () => {
    const filter = { join: 'AND', rules: [] };
    const effects = analyseStageEffects([
      stage({
        id: 's1',
        type: 'Sociogram',
        label: 'Sociogram',
        subject: nodeSubject,
        filter,
        background: { concentricCircles: 3 },
        prompts: [
          {
            id: 'p1',
            text: 'Place',
            layout: { layoutVariable: 'position' },
            highlight: { allowHighlighting: true, variable: 'flagged' },
          },
          {
            id: 'p2',
            text: 'Connect',
            layout: { layoutVariable: 'position' },
            edges: { create: 'friendship' },
          },
        ],
      }),
    ]);
    const [summary] = effects.stages;
    expect(summary?.writes).toEqual([
      {
        stageIndex: 0,
        entity: 'node',
        entityType: 'person',
        variableId: 'position',
        filter,
        mode: 'layout',
      },
      {
        stageIndex: 0,
        entity: 'node',
        entityType: 'person',
        variableId: 'flagged',
        filter,
        mode: 'highlight',
      },
      {
        stageIndex: 0,
        entity: 'node',
        entityType: 'person',
        variableId: 'position',
        filter,
        mode: 'layout',
      },
    ]);
    expect(summary?.edgeCreations).toEqual([
      {
        stageIndex: 0,
        edgeType: 'friendship',
        subjectNodeType: 'person',
        filter,
        ownNodesOnly: false,
        recordsNegatives: null,
        writesAtCreation: [],
        structured: null,
      },
    ]);
  });

  it('emits census metadata for DyadCensus but not OneToManyDyadCensus', () => {
    const census = (type: string) =>
      stage({
        id: type,
        type,
        label: type,
        subject: nodeSubject,
        introductionPanel: { title: 't', text: 'x' },
        prompts: [{ id: 'p1', text: 'Know?', createEdge: 'knows' }],
      });
    const effects = analyseStageEffects([
      census('DyadCensus'),
      census('OneToManyDyadCensus'),
    ]);
    expect(effects.stages[0]?.metadataKind).toBe('dyadCensus');
    expect(effects.stages[0]?.edgeCreations[0]?.recordsNegatives).toBe(
      'dyadCensus',
    );
    // The runtime records no tuples for OneToManyDyadCensus, so the analysis
    // drops the previously fabricated-but-ignored metadata.
    expect(effects.stages[1]?.metadataKind).toBeNull();
    expect(effects.stages[1]?.edgeCreations[0]?.recordsNegatives).toBeNull();
  });

  it('gives TieStrengthCensus its edge variable at creation and as a write', () => {
    const effects = analyseStageEffects([
      stage({
        id: 's1',
        type: 'TieStrengthCensus',
        label: 'Ties',
        subject: nodeSubject,
        introductionPanel: { title: 't', text: 'x' },
        prompts: [
          {
            id: 'p1',
            text: 'How strong?',
            createEdge: 'knows',
            edgeVariable: 'strength',
            negativeLabel: 'Not connected',
          },
        ],
      }),
    ]);
    const [summary] = effects.stages;
    expect(summary?.edgeCreations[0]).toMatchObject({
      recordsNegatives: 'tieStrength',
      writesAtCreation: ['strength'],
    });
    expect(summary?.writes).toEqual([
      {
        stageIndex: 0,
        entity: 'edge',
        entityType: 'knows',
        variableId: 'strength',
        mode: 'tieStrength',
      },
    ]);
  });

  it('writes bin variables but never a CategoricalBin otherVariable', () => {
    const effects = analyseStageEffects([
      stage({
        id: 'ord',
        type: 'OrdinalBin',
        label: 'Ordinal',
        subject: nodeSubject,
        prompts: [
          {
            id: 'p1',
            text: 'Rank',
            variable: 'rank',
            color: 'ord-color-seq-1',
          },
        ],
      }),
      stage({
        id: 'cat',
        type: 'CategoricalBin',
        label: 'Categorical',
        subject: nodeSubject,
        prompts: [
          {
            id: 'p1',
            text: 'Group',
            variable: 'group',
            otherVariable: 'group_other',
            otherVariablePrompt: 'What group?',
            otherOptionLabel: 'Other',
          },
        ],
      }),
    ]);
    expect(effects.stages[0]?.writes[0]).toMatchObject({
      variableId: 'rank',
      mode: 'ordinalBin',
    });
    expect(effects.stages[1]?.writes).toHaveLength(1);
    expect(effects.stages[1]?.writes[0]).toMatchObject({
      variableId: 'group',
      mode: 'categoricalBin',
    });
  });

  it('maps form stages onto their fields and subjects', () => {
    const fields = [
      { variable: 'a', prompt: 'A?' },
      { variable: 'b', prompt: 'B?' },
    ];
    const effects = analyseStageEffects([
      stage({ id: 'ego', type: 'EgoForm', label: 'You', form: { fields } }),
      stage({
        id: 'alter',
        type: 'AlterForm',
        label: 'Them',
        subject: nodeSubject,
        form: { fields },
      }),
      stage({
        id: 'edges',
        type: 'AlterEdgeForm',
        label: 'Links',
        subject: { entity: 'edge', type: 'knows' },
        form: { fields: [{ variable: 'note', prompt: 'Note?' }] },
      }),
    ]);
    expect(effects.stages[0]?.writes).toEqual([
      { stageIndex: 0, entity: 'ego', variableId: 'a', mode: 'form' },
      { stageIndex: 0, entity: 'ego', variableId: 'b', mode: 'form' },
    ]);
    expect(effects.stages[1]?.writes[0]).toMatchObject({
      entity: 'node',
      entityType: 'person',
      variableId: 'a',
    });
    expect(effects.stages[2]?.writes[0]).toMatchObject({
      entity: 'edge',
      entityType: 'knows',
      variableId: 'note',
    });
  });

  it('summarises a FamilyPedigree: creation writes, fixed edge values, nominations', () => {
    const effects = analyseStageEffects([
      stage({
        id: 'ped',
        type: 'FamilyPedigree',
        label: 'Family',
        nodeConfig: {
          type: 'family_member',
          nodeLabelVariable: 'label',
          egoVariable: 'is_ego',
          relationshipVariable: 'relationship',
          biologicalSexVariable: 'sex',
          form: [{ variable: 'age', prompt: 'Age?' }],
        },
        edgeConfig: {
          type: 'family_link',
          relationshipTypeVariable: 'link_type',
          isActiveVariable: 'active',
          isGestationalCarrierVariable: 'carrier',
          gameteRoleVariable: 'gamete',
        },
        framing: { mode: 'fixed', value: 'inclusive' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        censusPrompt: 'Add your family.',
        nominationPrompts: [
          { id: 'n1', text: 'Who is affected?', variable: 'affected' },
        ],
      }),
    ]);
    const [summary] = effects.stages;
    expect(summary?.metadataKind).toBe('familyPedigree');
    expect(summary?.nodeCreations[0]).toMatchObject({
      source: 'pedigree',
      capacity: { min: 1, max: null },
      writesAtCreation: ['is_ego', 'label', 'relationship', 'sex', 'age'],
    });
    expect(summary?.edgeCreations[0]).toMatchObject({
      edgeType: 'family_link',
      ownNodesOnly: true,
      structured: 'pedigree',
      writesAtCreation: ['link_type', 'active'],
    });
    expect(summary?.pedigree?.edgeFixedValues).toEqual({
      link_type: ['biological'],
      active: true,
    });
    expect(summary?.writes).toEqual([
      {
        stageIndex: 0,
        entity: 'node',
        entityType: 'family_member',
        variableId: 'affected',
        mode: 'pedigreeNomination',
      },
    ]);
  });

  it('summarises a NetworkComposer without fabricating layout writes', () => {
    const effects = analyseStageEffects([
      stage({
        id: 'composer',
        type: 'NetworkComposer',
        label: 'Compose',
        subject: nodeSubject,
        quickAdd: 'name',
        layoutVariable: 'position',
        convexHullVariable: 'group',
        nodeForm: { fields: [{ variable: 'role', label: 'Role' }] },
        background: { concentricCircles: 1 },
        edges: [
          {
            id: 'e1',
            subject: { entity: 'edge', type: 'works_with' },
            form: { fields: [{ variable: 'since', label: 'Since' }] },
          },
        ],
      }),
    ]);
    const [summary] = effects.stages;
    expect(summary?.metadataKind).toBe('networkComposer');
    expect(summary?.nodeCreations[0]).toMatchObject({
      source: 'composer',
      writesAtCreation: ['name', 'role', 'group'],
    });
    expect(summary?.nodeCreations[0]?.writesAtCreation).not.toContain(
      'position',
    );
    expect(summary?.edgeCreations[0]).toMatchObject({
      edgeType: 'works_with',
      ownNodesOnly: true,
      writesAtCreation: ['since'],
    });
  });

  it('writes geospatial prompt variables', () => {
    const effects = analyseStageEffects([
      stage({
        id: 'geo',
        type: 'Geospatial',
        label: 'Where',
        subject: nodeSubject,
        mapOptions: {},
        prompts: [{ id: 'p1', text: 'Where?', variable: 'home' }],
      }),
    ]);
    expect(effects.stages[0]?.writes[0]).toMatchObject({
      variableId: 'home',
      mode: 'geospatial',
    });
  });

  it('treats content stages as inert', () => {
    const effects = analyseStageEffects([
      stage({ id: 'info', type: 'Information', label: 'About' }),
      stage({ id: 'nar', type: 'Narrative', label: 'Story' }),
    ]);
    for (const summary of effects.stages) {
      expect(summary.kind).toBe('content');
      expect(summary.nodeCreations).toHaveLength(0);
      expect(summary.edgeCreations).toHaveLength(0);
      expect(summary.writes).toHaveLength(0);
    }
    expect(effects.creatableNodeTypes.size).toBe(0);
  });

  it('aggregates edge creations by type across stages', () => {
    const effects = analyseStageEffects([
      stage({
        id: 'soc',
        type: 'Sociogram',
        label: 'S',
        subject: nodeSubject,
        background: { concentricCircles: 3 },
        prompts: [
          {
            id: 'p1',
            text: 'Connect',
            layout: { layoutVariable: 'position' },
            edges: { create: 'knows' },
          },
        ],
      }),
      stage({
        id: 'census',
        type: 'DyadCensus',
        label: 'C',
        subject: nodeSubject,
        introductionPanel: { title: 't', text: 'x' },
        prompts: [{ id: 'p1', text: 'Know?', createEdge: 'knows' }],
      }),
    ]);
    expect(effects.edgeCreationsByType.get('knows')).toHaveLength(2);
    expect(
      effects.edgeCreationsByType.get('knows')?.map((c) => c.stageIndex),
    ).toEqual([0, 1]);
  });

  it('refuses an unsupported stage type', () => {
    expect(() =>
      analyseStageEffects([
        stage({ id: 'x', type: 'HolographicSociogram', label: 'X' }),
      ]),
    ).toThrow(/Unsupported stage type/);
  });
});
