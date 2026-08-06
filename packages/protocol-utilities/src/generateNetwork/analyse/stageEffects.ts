import type { Stage } from '@codaco/protocol-validation';

import { isContentStage } from '../contentStages';

/**
 * Normalized stage-effect model: what every stage can create, which variables
 * it writes, what it fixes, and how much it can hold. Derived from the stage
 * schemas and the interview runtime's behaviour, this is the vocabulary the
 * planner sizes populations against and the scheduler assigns work with.
 *
 * Deliberate departures from the previous generator, which filled every
 * codebook variable the moment an entity was created:
 *
 * - An entity carries only what its creating interaction actually writes
 *   (form fields, quick-add, roster row, fixed values); later stages write
 *   their own variables. A variable no reachable stage writes stays
 *   unanswered — exactly what a real interview produces.
 * - Sociogram highlight variables and composer convex-hull variables have
 *   defined writers here instead of riding a generic creation fill.
 * - A CategoricalBin's `otherVariable` is left unanswered: it only receives
 *   text when a participant routes through the "other" dialog, which the
 *   planned selection (drawn from the option list) never does.
 */

type StageOf<T extends Stage['type']> = Extract<Stage, { type: T }>;

export type StageFilter = NonNullable<StageOf<'AlterForm'>['filter']>;

export type StageCapacity = {
  min: number;
  /** null = no stage-imposed ceiling; the planner's population decides. */
  max: number | null;
};

export type NodeCreation = {
  stageIndex: number;
  nodeType: string;
  source: 'fabricated' | 'roster' | 'pedigree' | 'composer';
  capacity: StageCapacity;
  /** Variables the creating interaction itself writes on the new node. */
  writesAtCreation: string[];
  /**
   * Boolean attributes each prompt fixes on nodes added under it
   * (`additionalAttributes`), in prompt order.
   */
  promptFixedValues: Record<string, boolean>[];
  /** Stage id for the roster three-way `externalData` lookup. */
  rosterStageId?: string;
};

export type EdgeCreation = {
  stageIndex: number;
  edgeType: string;
  /** Node type supplying both endpoints. */
  subjectNodeType: string;
  filter?: StageFilter;
  /** Endpoints restricted to nodes this same stage created. */
  ownNodesOnly: boolean;
  /**
   * Census stages ask about every pair, so a pair the plan leaves unlinked
   * becomes an explicit negative nomination in stage metadata.
   */
  recordsNegatives: 'dyadCensus' | 'tieStrength' | null;
  /** Variables the creating interaction writes on the new edge. */
  writesAtCreation: string[];
  /** Parent→child edges inside a pedigree's own family structure. */
  structured: 'pedigree' | null;
};

export type WriteMode =
  | 'creation'
  | 'form'
  | 'ordinalBin'
  | 'categoricalBin'
  | 'tieStrength'
  | 'layout'
  | 'highlight'
  | 'geospatial'
  | 'composerHull'
  | 'pedigreeNomination';

export type VariableWrite = {
  stageIndex: number;
  entity: 'node' | 'edge' | 'ego';
  /** Undefined for ego. */
  entityType?: string;
  variableId: string;
  filter?: StageFilter;
  mode: WriteMode;
};

export type PedigreeEffect = {
  stageIndex: number;
  nodeType: string;
  edgeType: string;
  egoVariable: string;
  labelVariable: string;
  relationshipVariable: string;
  biologicalSexVariable: string;
  formFields: string[];
  /**
   * Values the interface fixes on every edge it creates. The
   * gestational-carrier and gamete-role variables are deliberately never
   * written — the runtime only sets them on assisted-reproduction paths the
   * generator does not fabricate.
   */
  edgeFixedValues: Record<string, unknown>;
  framing: StageOf<'FamilyPedigree'>['framing'];
  nominationVariables: string[];
};

export type StageEffectSummary = {
  index: number;
  stage: Stage;
  /** Content stages neither create nor write. */
  kind: 'content' | 'active';
  metadataKind: 'dyadCensus' | 'familyPedigree' | 'networkComposer' | null;
  nodeCreations: NodeCreation[];
  edgeCreations: EdgeCreation[];
  writes: VariableWrite[];
  pedigree?: PedigreeEffect;
};

export type StageEffects = {
  stages: StageEffectSummary[];
  /** Node types at least one stage in the protocol can create. */
  creatableNodeTypes: Set<string>;
  /**
   * Edge types with at least one creating stage, with every (stage, node
   * subject, filter) that contributes endpoint pairs to their domain.
   */
  edgeCreationsByType: Map<string, EdgeCreation[]>;
};

const behavioursCapacity = (
  behaviours: { minNodes?: number; maxNodes?: number } | undefined,
): StageCapacity => ({
  min: behaviours?.minNodes ?? 0,
  max: behaviours?.maxNodes ?? null,
});

const promptFixedValues = (
  prompts: readonly {
    additionalAttributes?: readonly { variable: string; value: boolean }[];
  }[],
): Record<string, boolean>[] =>
  prompts.map((prompt) =>
    Object.fromEntries(
      (prompt.additionalAttributes ?? []).map((attribute) => [
        attribute.variable,
        attribute.value,
      ]),
    ),
  );

/**
 * Values a FamilyPedigree fixes on every edge it creates: the relationship
 * type is 'biological' (a categorical, so an array) and the link is active.
 */
export const pedigreeEdgeFixedValues = (
  edgeConfig: StageOf<'FamilyPedigree'>['edgeConfig'],
): Record<string, unknown> => ({
  [edgeConfig.relationshipTypeVariable]: ['biological'],
  [edgeConfig.isActiveVariable]: true,
});

function summariseStage(stage: Stage, index: number): StageEffectSummary {
  if (isContentStage(stage)) {
    return {
      index,
      stage,
      kind: 'content',
      metadataKind: null,
      nodeCreations: [],
      edgeCreations: [],
      writes: [],
    };
  }

  const summary: StageEffectSummary = {
    index,
    stage,
    kind: 'active',
    metadataKind: null,
    nodeCreations: [],
    edgeCreations: [],
    writes: [],
  };

  switch (stage.type) {
    case 'NameGenerator': {
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType: stage.subject.type,
        source: 'fabricated',
        capacity: behavioursCapacity(stage.behaviours),
        writesAtCreation: stage.form.fields.map((field) => field.variable),
        promptFixedValues: promptFixedValues(stage.prompts),
      });
      break;
    }

    case 'NameGeneratorQuickAdd': {
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType: stage.subject.type,
        source: 'fabricated',
        capacity: behavioursCapacity(stage.behaviours),
        writesAtCreation: [stage.quickAdd],
        promptFixedValues: promptFixedValues(stage.prompts),
      });
      break;
    }

    case 'NameGeneratorRoster': {
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType: stage.subject.type,
        source: 'roster',
        capacity: behavioursCapacity(stage.behaviours),
        // Roster rows arrive carrying their own attribute data.
        writesAtCreation: [],
        promptFixedValues: promptFixedValues(stage.prompts),
        rosterStageId: stage.id,
      });
      break;
    }

    case 'Sociogram': {
      for (const prompt of stage.prompts) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: stage.subject.type,
          variableId: prompt.layout.layoutVariable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: 'layout',
        });
        if (prompt.highlight?.allowHighlighting && prompt.highlight.variable) {
          summary.writes.push({
            stageIndex: index,
            entity: 'node',
            entityType: stage.subject.type,
            variableId: prompt.highlight.variable,
            ...(stage.filter ? { filter: stage.filter } : {}),
            mode: 'highlight',
          });
        }
        if (prompt.edges?.create) {
          summary.edgeCreations.push({
            stageIndex: index,
            edgeType: prompt.edges.create,
            subjectNodeType: stage.subject.type,
            ...(stage.filter ? { filter: stage.filter } : {}),
            ownNodesOnly: false,
            recordsNegatives: null,
            writesAtCreation: [],
            structured: null,
          });
        }
      }
      break;
    }

    case 'DyadCensus':
    case 'OneToManyDyadCensus': {
      // OneToManyDyadCensus tuples are inert to the interview runtime (it
      // records none for this type), so only DyadCensus emits metadata —
      // dropping the previous generator's fabricated-but-ignored entries.
      if (stage.type === 'DyadCensus') summary.metadataKind = 'dyadCensus';
      for (const prompt of stage.prompts) {
        summary.edgeCreations.push({
          stageIndex: index,
          edgeType: prompt.createEdge,
          subjectNodeType: stage.subject.type,
          ...(stage.filter ? { filter: stage.filter } : {}),
          ownNodesOnly: false,
          recordsNegatives: stage.type === 'DyadCensus' ? 'dyadCensus' : null,
          writesAtCreation: [],
          structured: null,
        });
      }
      break;
    }

    case 'TieStrengthCensus': {
      for (const prompt of stage.prompts) {
        summary.edgeCreations.push({
          stageIndex: index,
          edgeType: prompt.createEdge,
          subjectNodeType: stage.subject.type,
          ...(stage.filter ? { filter: stage.filter } : {}),
          ownNodesOnly: false,
          recordsNegatives: 'tieStrength',
          writesAtCreation: [prompt.edgeVariable],
          structured: null,
        });
        summary.writes.push({
          stageIndex: index,
          entity: 'edge',
          entityType: prompt.createEdge,
          variableId: prompt.edgeVariable,
          mode: 'tieStrength',
        });
      }
      break;
    }

    case 'OrdinalBin':
    case 'CategoricalBin': {
      for (const prompt of stage.prompts) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: stage.subject.type,
          variableId: prompt.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: stage.type === 'OrdinalBin' ? 'ordinalBin' : 'categoricalBin',
        });
      }
      break;
    }

    case 'EgoForm': {
      for (const field of stage.form.fields) {
        summary.writes.push({
          stageIndex: index,
          entity: 'ego',
          variableId: field.variable,
          mode: 'form',
        });
      }
      break;
    }

    case 'AlterForm': {
      for (const field of stage.form.fields) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: stage.subject.type,
          variableId: field.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: 'form',
        });
      }
      break;
    }

    case 'AlterEdgeForm': {
      for (const field of stage.form.fields) {
        summary.writes.push({
          stageIndex: index,
          entity: 'edge',
          entityType: stage.subject.type,
          variableId: field.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: 'form',
        });
      }
      break;
    }

    case 'FamilyPedigree': {
      const formFields = (stage.nodeConfig.form ?? []).map(
        (field) => field.variable,
      );
      summary.metadataKind = 'familyPedigree';
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType: stage.nodeConfig.type,
        source: 'pedigree',
        // The proband always exists; the family around them is population-
        // sized by the planner.
        capacity: { min: 1, max: null },
        writesAtCreation: [
          stage.nodeConfig.egoVariable,
          stage.nodeConfig.nodeLabelVariable,
          stage.nodeConfig.relationshipVariable,
          stage.nodeConfig.biologicalSexVariable,
          ...formFields,
        ],
        promptFixedValues: [],
      });
      summary.edgeCreations.push({
        stageIndex: index,
        edgeType: stage.edgeConfig.type,
        subjectNodeType: stage.nodeConfig.type,
        ownNodesOnly: true,
        recordsNegatives: null,
        writesAtCreation: Object.keys(
          pedigreeEdgeFixedValues(stage.edgeConfig),
        ),
        structured: 'pedigree',
      });
      const nominationVariables = (stage.nominationPrompts ?? []).map(
        (prompt) => prompt.variable,
      );
      for (const variableId of nominationVariables) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: stage.nodeConfig.type,
          variableId,
          mode: 'pedigreeNomination',
        });
      }
      summary.pedigree = {
        stageIndex: index,
        nodeType: stage.nodeConfig.type,
        edgeType: stage.edgeConfig.type,
        egoVariable: stage.nodeConfig.egoVariable,
        labelVariable: stage.nodeConfig.nodeLabelVariable,
        relationshipVariable: stage.nodeConfig.relationshipVariable,
        biologicalSexVariable: stage.nodeConfig.biologicalSexVariable,
        formFields,
        edgeFixedValues: pedigreeEdgeFixedValues(stage.edgeConfig),
        framing: stage.framing,
        nominationVariables,
      };
      break;
    }

    case 'Geospatial': {
      for (const prompt of stage.prompts) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: stage.subject.type,
          variableId: prompt.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: 'geospatial',
        });
      }
      break;
    }

    case 'NetworkComposer': {
      summary.metadataKind = 'networkComposer';
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType: stage.subject.type,
        source: 'composer',
        capacity: { min: 0, max: null },
        writesAtCreation: [
          stage.quickAdd,
          ...(stage.nodeForm?.fields ?? []).map((field) => field.variable),
          // Group membership is toggled through the composer's own tools; the
          // planned categorical value lands with the node. The layout
          // variable is NOT written: generated sessions report automatic
          // layout in stage metadata instead of fabricating positions.
          ...(stage.convexHullVariable ? [stage.convexHullVariable] : []),
        ],
        promptFixedValues: [],
      });
      for (const edge of stage.edges ?? []) {
        summary.edgeCreations.push({
          stageIndex: index,
          edgeType: edge.subject.type,
          subjectNodeType: stage.subject.type,
          ownNodesOnly: true,
          recordsNegatives: null,
          writesAtCreation: (edge.form?.fields ?? []).map(
            (field) => field.variable,
          ),
          structured: null,
        });
      }
      break;
    }

    default: {
      const unsupported: never = stage;
      throw new Error(
        `Unsupported stage type "${(unsupported as Stage).type}". ` +
          'Synthetic data generation does not yet support this stage type.',
      );
    }
  }

  return summary;
}

export function analyseStageEffects(stages: Stage[]): StageEffects {
  const summaries = stages.map((stage, index) => summariseStage(stage, index));

  const creatableNodeTypes = new Set<string>();
  const edgeCreationsByType = new Map<string, EdgeCreation[]>();
  for (const summary of summaries) {
    for (const creation of summary.nodeCreations) {
      creatableNodeTypes.add(creation.nodeType);
    }
    for (const creation of summary.edgeCreations) {
      const list = edgeCreationsByType.get(creation.edgeType) ?? [];
      list.push(creation);
      edgeCreationsByType.set(creation.edgeType, list);
    }
  }

  // Codebook types no stage names simply never appear in these sets; the
  // planner resolves their counts (and topologies) against membership here.
  return { stages: summaries, creatableNodeTypes, edgeCreationsByType };
}
