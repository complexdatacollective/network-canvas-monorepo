import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import {
  defaultTopologyForStage,
  DEFAULT_NODE_COUNT,
} from '../../plan/resolveSynthetic';
import {
  analyseStageEffects,
  declaresNodeCollection,
  lastExistingWriterByType,
  nodeVariablesWrittenOnCreation,
  pedigreeDrawnNodeVariables,
  pedigreeEgoNodeVariables,
  pedigreeNodeVariables,
  stageWritesExistingNodeVariable,
} from '../stageEffects';

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
        stageId: 's1',
        stageIndex: 0,
        nodeType: 'person',
        source: 'fabricated',
        capacity: { min: 2, max: 6 },
        // Declared by the stage, so an undeclared one resolves the default
        // here in `analyse` rather than anywhere downstream — and says so, to
        // keep a roster's fallback from being read as the author's intent.
        count: DEFAULT_NODE_COUNT,
        countDeclared: false,
        writesAtCreation: ['name'],
        promptFixedValues: [{ close: true }, {}],
        rosterValuesWin: false,
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
    // Each write records the prompt that collects it, so materialisation can
    // replay a stage's effects in the order its screens present them.
    expect(summary?.writes).toEqual([
      {
        stageIndex: 0,
        entity: 'node',
        entityType: 'person',
        variableId: 'position',
        filter,
        promptIndex: 0,
        mode: 'layout',
      },
      {
        stageIndex: 0,
        entity: 'node',
        entityType: 'person',
        variableId: 'flagged',
        filter,
        promptIndex: 0,
        mode: 'highlight',
      },
      {
        stageIndex: 0,
        entity: 'node',
        entityType: 'person',
        variableId: 'position',
        filter,
        promptIndex: 1,
        mode: 'layout',
      },
    ]);
    expect(summary?.edgeCreations).toEqual([
      {
        stageId: 's1',
        stageIndex: 0,
        // The second prompt is the one creating edges; its place in the
        // stage's own sequence is what breaks ties between edge types.
        promptIndex: 1,
        edgeType: 'friendship',
        subjectNodeType: 'person',
        // A Sociogram links at its own default, not the shared fallback.
        topology: defaultTopologyForStage('Sociogram'),
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
        // Carried so the write stays confined to the pairs this census walks,
        // rather than reaching every edge of the type.
        subjectNodeType: 'person',
        promptIndex: 0,
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
      // The canvas holds every node of the subject type, so a composer can
      // join two people an earlier stage introduced.
      ownNodesOnly: false,
      writesAtCreation: ['since'],
    });
    expect(summary?.writes).toContainEqual({
      stageIndex: 0,
      entity: 'edge',
      entityType: 'works_with',
      variableId: 'since',
      subjectNodeType: 'person',
      mode: 'form',
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

/**
 * The projections feasibility counts against. They answer per stage, from the
 * same summaries the planner reads, so a count and a walk cannot disagree about
 * what a stage writes.
 */
describe('stage write queries', () => {
  const pedigreeStage = (nodeConfig: Record<string, unknown>): Stage =>
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
        ...nodeConfig,
      },
      edgeConfig: { type: 'family_link' },
      framing: { mode: 'fixed', value: 'inclusive' },
      censusPrompt: 'Add your family.',
    });

  it('counts a prompt fixed value as written on the nodes it adds', () => {
    const generator = stage({
      id: 'ng',
      type: 'NameGenerator',
      label: 'Names',
      subject: nodeSubject,
      form: { fields: [{ variable: 'nickname', prompt: 'Nickname' }] },
      prompts: [
        { id: 'p1', text: 'Close?' },
        {
          id: 'p2',
          text: 'Family?',
          additionalAttributes: [{ variable: 'is_family', value: true }],
        },
      ],
    });

    expect(nodeVariablesWrittenOnCreation(generator, [generator], 0)).toEqual(
      new Set(['nickname']),
    );
    expect(nodeVariablesWrittenOnCreation(generator, [generator], 1)).toEqual(
      new Set(['nickname', 'is_family']),
    );
  });

  it('leaves a roster and a fixture with no collection surface to the whole-type fill', () => {
    const roster = stage({
      id: 'roster',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: nodeSubject,
      dataSource: 'people.csv',
      prompts: [{ id: 'p1', text: 'Pick' }],
    });
    const bare = stage({
      id: 'bare',
      type: 'NameGeneratorQuickAdd',
      label: 'Names',
      subject: nodeSubject,
      prompts: [{ id: 'p1', text: 'Who?' }],
    });

    expect(declaresNodeCollection(roster, 0)).toBe(false);
    expect(declaresNodeCollection(bare, 0)).toBe(false);
  });

  it('suppresses the pedigree form fields the interface never renders', () => {
    const collides = pedigreeStage({
      nodeLabelVariable: 'displayName',
      form: [
        { variable: 'name', prompt: 'Reserved' },
        { variable: 'displayName', prompt: 'Duplicated' },
        { variable: 'age', prompt: 'Age?' },
      ],
    });

    expect(pedigreeDrawnNodeVariables(collides)).toEqual(
      new Set(['displayName', 'age']),
    );
  });

  it('gives a pedigree relatives the diseases a NarrativePedigree reads', () => {
    const family = pedigreeStage({
      form: [{ variable: 'age', prompt: 'Age?' }],
    });
    const stages = [
      family,
      stage({
        id: 'story',
        type: 'NarrativePedigree',
        label: 'Story',
        sourceStageId: 'ped',
        diseases: [
          {
            variable: 'has_condition',
            inheritancePattern: 'autosomalDominant',
          },
        ],
      }),
    ];

    expect(pedigreeNodeVariables(family, stages)).toEqual(
      new Set([
        'label',
        'age',
        'is_ego',
        'relationship',
        'sex',
        'has_condition',
      ]),
    );
  });

  it('asks the pedigree ego only for the values its iconic node carries', () => {
    const family = pedigreeStage({
      form: [{ variable: 'age', prompt: 'Age?' }],
    });
    // A rule ties the unrendered age control to a value the ego does carry.
    // Answering it anyway would write a control the ego is never shown.
    const variables = {
      sex: {},
      age: { validation: { sameAs: 'sex' } },
      label: {},
      is_ego: {},
      relationship: {},
    };

    expect(pedigreeEgoNodeVariables(family, [family], variables)).toEqual(
      new Set(['is_ego', 'sex']),
    );
  });

  it('reads a pedigree as a writer on the people an earlier stage introduced', () => {
    const family = pedigreeStage({});
    const stages = [family];

    expect(
      stageWritesExistingNodeVariable(
        family,
        stages,
        'family_member',
        'is_ego',
      ),
    ).toBe(true);
    // Biological sex is settled when the pedigree builds its own people; it is
    // not rewritten over the ones it inherits, except on a reused focal node.
    expect(
      stageWritesExistingNodeVariable(family, stages, 'family_member', 'sex'),
    ).toBe(false);
  });

  it('skips a filtered writer only where filtering is respected', () => {
    const stages = [
      stage({
        id: 'bin',
        type: 'OrdinalBin',
        label: 'Bin',
        subject: nodeSubject,
        filter: { join: 'AND', rules: [] },
        prompts: [{ id: 'p1', text: 'How close?', variable: 'closeness' }],
      }),
    ];

    expect(lastExistingWriterByType(stages).get('person')).toEqual(
      new Map([['closeness', 0]]),
    );
    expect(
      lastExistingWriterByType(stages, undefined, true).get('person'),
    ).toBeUndefined();
  });
});
