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
  /**
   * Which side wins when a roster row and its prompt both carry a variable.
   * `NameGeneratorRoster` builds the node itself and spreads the row's data
   * last, so the row wins; every other roster path adds the node to a prompt,
   * and `addNodeToPrompt` asserts the prompt's values over whatever the node
   * already holds.
   */
  rosterValuesWin: boolean;
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
  /**
   * Per entity scope (`node:person`, `edge:friend`, `ego`), every variable
   * some stage writes.
   *
   * The planner draws only what appears here: a variable nothing writes is
   * never answered, so planning a value for it would claim a `unique` slot the
   * network never uses — and feasibility, which exempts unwritten variables
   * from its counting, would accept protocols the plan then failed on.
   */
  writeIndex: Map<string, Map<string, number>>;
  /**
   * The last stage that writes each variable onto entities it did not itself
   * create — a form, a bin, a census — which is what can overwrite a value an
   * earlier stage fixed.
   *
   * Creation-time writes are deliberately excluded: a prompt's
   * `additionalAttributes` land only on the nodes added under that prompt, so
   * a later stage fixing a value says nothing about an entity created before
   * it. Filtered and skippable writes are excluded too, since neither is
   * certain to reach a given entity — the direction feasibility already takes
   * when it keeps a pin it cannot prove is redrawn.
   */
  rewriteIndex: Map<string, Map<string, number>>;
};

/** Scope key for `writeIndex`, matching the constraint machinery's. */
export const scopeKeyFor = (entity: string, type?: string): string =>
  entity === 'ego' ? 'ego' : `${entity}:${type}`;

/** The variables some stage writes for one entity scope. */
export function writtenVariables(
  effects: StageEffects,
  entity: string,
  type?: string,
): Set<string> {
  const writes = effects.writeIndex.get(scopeKeyFor(entity, type));
  return new Set(writes?.keys() ?? []);
}

/**
 * Whether any stage after `stageIndex` writes `variableId` on this scope — the
 * test for whether a value fixed at creation survives to the final network.
 */
export function isRewrittenAfter(
  effects: StageEffects,
  scope: string,
  variableId: string,
  stageIndex: number,
): boolean {
  const last = effects.rewriteIndex.get(scope)?.get(variableId);
  return last !== undefined && last > stageIndex;
}

const behavioursCapacity = (
  behaviours: { minNodes?: number; maxNodes?: number } | undefined,
): StageCapacity => ({
  min: behaviours?.minNodes ?? 0,
  max: behaviours?.maxNodes ?? null,
});

/**
 * Architect's StageEditor previews half-built stages through PreviewHost, so
 * analysis reads a stage as a draft: any property the schema requires may be
 * absent while it is being authored. These accessors take the declared type
 * and answer for a draft, so a stage missing its subject or form contributes
 * nothing instead of throwing and collapsing the preview into its failure
 * screen.
 */
const subjectTypeOf = (subject: { type?: string } | undefined) => subject?.type;

/** The variables a form's fields write, skipping fields with none chosen. */
const formVariables = (
  form: { fields?: readonly { variable?: string }[] } | undefined,
): string[] =>
  definedStrings((form?.fields ?? []).map((field) => field.variable));

const definedStrings = (values: readonly (string | undefined)[]): string[] =>
  values.filter((value): value is string => value !== undefined);

// Written over the array type rather than its element, so a case handling two
// stage types (OrdinalBin/CategoricalBin) keeps the union of their prompts
// instead of collapsing to whichever branch inference reached first.
const promptsOf = <T extends readonly unknown[]>(
  prompts: T | undefined,
): T | readonly [] => prompts ?? [];

/**
 * A name generator given panels draws real rows too, from `externalData` under
 * the stage's own id — the same three-way lookup a roster stage uses.
 *
 * It still fabricates: a panel is a shortcut for naming someone already known,
 * not a closed list, so an exhausted panel leaves the stage adding people by
 * hand. And it adds through `addNodeToPrompt`, which asserts the prompt's
 * values over the row's, opposite to the roster interface.
 */
const panelSource = (
  panels: readonly unknown[] | undefined,
  stageId: string,
): Pick<NodeCreation, 'rosterStageId' | 'rosterValuesWin'> => ({
  ...(panels !== undefined && panels.length > 0
    ? { rosterStageId: stageId }
    : {}),
  rosterValuesWin: false,
});

const promptFixedValues = (
  prompts: readonly {
    additionalAttributes?: readonly { variable?: string; value?: boolean }[];
  }[],
): Record<string, boolean>[] =>
  prompts.map((prompt) =>
    Object.fromEntries(
      (prompt.additionalAttributes ?? [])
        .filter(
          (attribute): attribute is { variable: string; value: boolean } =>
            attribute.variable !== undefined && attribute.value !== undefined,
        )
        .map((attribute) => [attribute.variable, attribute.value]),
    ),
  );

/**
 * Values a FamilyPedigree fixes on every edge it creates: the relationship
 * type is 'biological' (a categorical, so an array) and the link is active.
 */
const pedigreeEdgeFixedValues = (
  edgeConfig:
    | { relationshipTypeVariable?: string; isActiveVariable?: string }
    | undefined,
): Record<string, unknown> => ({
  ...(edgeConfig?.relationshipTypeVariable !== undefined
    ? { [edgeConfig.relationshipTypeVariable]: ['biological'] }
    : {}),
  ...(edgeConfig?.isActiveVariable !== undefined
    ? { [edgeConfig.isActiveVariable]: true }
    : {}),
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
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType,
        source: 'fabricated',
        capacity: behavioursCapacity(stage.behaviours),
        writesAtCreation: formVariables(stage.form),
        promptFixedValues: promptFixedValues(promptsOf(stage.prompts)),
        ...panelSource(stage.panels, stage.id),
      });
      break;
    }

    case 'NameGeneratorQuickAdd': {
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType,
        source: 'fabricated',
        capacity: behavioursCapacity(stage.behaviours),
        writesAtCreation: definedStrings([stage.quickAdd]),
        promptFixedValues: promptFixedValues(promptsOf(stage.prompts)),
        ...panelSource(stage.panels, stage.id),
      });
      break;
    }

    case 'NameGeneratorRoster': {
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType,
        source: 'roster',
        capacity: behavioursCapacity(stage.behaviours),
        // Roster rows arrive carrying their own attribute data.
        writesAtCreation: [],
        promptFixedValues: promptFixedValues(promptsOf(stage.prompts)),
        rosterStageId: stage.id,
        // This interface builds the node itself, spreading the row's data
        // over the prompt's attributes.
        rosterValuesWin: true,
      });
      break;
    }

    case 'Sociogram': {
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      for (const prompt of promptsOf(stage.prompts)) {
        const layoutVariable = prompt.layout?.layoutVariable;
        if (layoutVariable !== undefined) {
          summary.writes.push({
            stageIndex: index,
            entity: 'node',
            entityType: nodeType,
            variableId: layoutVariable,
            ...(stage.filter ? { filter: stage.filter } : {}),
            mode: 'layout',
          });
        }
        if (prompt.highlight?.allowHighlighting && prompt.highlight.variable) {
          summary.writes.push({
            stageIndex: index,
            entity: 'node',
            entityType: nodeType,
            variableId: prompt.highlight.variable,
            ...(stage.filter ? { filter: stage.filter } : {}),
            mode: 'highlight',
          });
        }
        if (prompt.edges?.create) {
          summary.edgeCreations.push({
            stageIndex: index,
            edgeType: prompt.edges.create,
            subjectNodeType: nodeType,
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
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      for (const prompt of promptsOf(stage.prompts)) {
        if (prompt.createEdge === undefined) continue;
        summary.edgeCreations.push({
          stageIndex: index,
          edgeType: prompt.createEdge,
          subjectNodeType: nodeType,
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
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      for (const prompt of promptsOf(stage.prompts)) {
        if (prompt.createEdge === undefined) continue;
        summary.edgeCreations.push({
          stageIndex: index,
          edgeType: prompt.createEdge,
          subjectNodeType: nodeType,
          ...(stage.filter ? { filter: stage.filter } : {}),
          ownNodesOnly: false,
          recordsNegatives: 'tieStrength',
          writesAtCreation: definedStrings([prompt.edgeVariable]),
          structured: null,
        });
        if (prompt.edgeVariable === undefined) continue;
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
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      for (const prompt of promptsOf(stage.prompts)) {
        if (prompt.variable === undefined) continue;
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: nodeType,
          variableId: prompt.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: stage.type === 'OrdinalBin' ? 'ordinalBin' : 'categoricalBin',
        });
      }
      break;
    }

    case 'EgoForm': {
      for (const variableId of formVariables(stage.form)) {
        summary.writes.push({
          stageIndex: index,
          entity: 'ego',
          variableId,
          mode: 'form',
        });
      }
      break;
    }

    case 'AlterForm': {
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      for (const variableId of formVariables(stage.form)) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: nodeType,
          variableId,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: 'form',
        });
      }
      break;
    }

    case 'AlterEdgeForm': {
      const edgeType = subjectTypeOf(stage.subject);
      if (edgeType === undefined) break;
      for (const variableId of formVariables(stage.form)) {
        summary.writes.push({
          stageIndex: index,
          entity: 'edge',
          entityType: edgeType,
          variableId,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: 'form',
        });
      }
      break;
    }

    case 'FamilyPedigree': {
      summary.metadataKind = 'familyPedigree';
      const { nodeConfig, edgeConfig } = stage;
      const nodeType = nodeConfig?.type;
      const edgeType = edgeConfig?.type;
      if (nodeType === undefined || edgeType === undefined) break;
      const formFields = definedStrings(
        (nodeConfig.form ?? []).map((field) => field.variable),
      );
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType,
        source: 'pedigree',
        // The proband always exists; the family around them is population-
        // sized by the planner.
        capacity: { min: 1, max: null },
        writesAtCreation: definedStrings([
          nodeConfig.egoVariable,
          nodeConfig.nodeLabelVariable,
          nodeConfig.relationshipVariable,
          nodeConfig.biologicalSexVariable,
          ...formFields,
        ]),
        promptFixedValues: [],
        rosterValuesWin: false,
      });
      summary.edgeCreations.push({
        stageIndex: index,
        edgeType,
        subjectNodeType: nodeType,
        ownNodesOnly: true,
        recordsNegatives: null,
        writesAtCreation: Object.keys(pedigreeEdgeFixedValues(edgeConfig)),
        structured: 'pedigree',
      });
      const nominationVariables = definedStrings(
        (stage.nominationPrompts ?? []).map((prompt) => prompt.variable),
      );
      for (const variableId of nominationVariables) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: nodeType,
          variableId,
          mode: 'pedigreeNomination',
        });
      }
      summary.pedigree = {
        stageIndex: index,
        nodeType,
        edgeType,
        egoVariable: nodeConfig.egoVariable ?? '',
        labelVariable: nodeConfig.nodeLabelVariable ?? '',
        relationshipVariable: nodeConfig.relationshipVariable ?? '',
        biologicalSexVariable: nodeConfig.biologicalSexVariable ?? '',
        formFields,
        edgeFixedValues: pedigreeEdgeFixedValues(edgeConfig),
        framing: stage.framing,
        nominationVariables,
      };
      break;
    }

    case 'Geospatial': {
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      for (const prompt of promptsOf(stage.prompts)) {
        if (prompt.variable === undefined) continue;
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: nodeType,
          variableId: prompt.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          mode: 'geospatial',
        });
      }
      break;
    }

    case 'NetworkComposer': {
      summary.metadataKind = 'networkComposer';
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      summary.nodeCreations.push({
        stageIndex: index,
        nodeType,
        source: 'composer',
        capacity: { min: 0, max: null },
        writesAtCreation: definedStrings([
          stage.quickAdd,
          ...formVariables(stage.nodeForm),
          // Group membership is toggled through the composer's own tools; the
          // planned categorical value lands with the node. The layout
          // variable is NOT written: generated sessions report automatic
          // layout in stage metadata instead of fabricating positions.
          stage.convexHullVariable,
        ]),
        promptFixedValues: [],
        rosterValuesWin: false,
      });
      for (const edge of stage.edges ?? []) {
        const edgeType = subjectTypeOf(edge.subject);
        if (edgeType === undefined) continue;
        summary.edgeCreations.push({
          stageIndex: index,
          edgeType,
          subjectNodeType: nodeType,
          ownNodesOnly: true,
          recordsNegatives: null,
          writesAtCreation: formVariables(edge.form),
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
  const writeIndex = new Map<string, Map<string, number>>();
  const rewriteIndex = new Map<string, Map<string, number>>();

  const recordInto =
    (index: Map<string, Map<string, number>>) =>
    (scope: string, variableId: string, at: number): void => {
      const forScope = index.get(scope) ?? new Map<string, number>();
      forScope.set(variableId, Math.max(forScope.get(variableId) ?? -1, at));
      index.set(scope, forScope);
    };
  const recordWrite = recordInto(writeIndex);
  const recordRewrite = recordInto(rewriteIndex);

  for (const summary of summaries) {
    for (const creation of summary.nodeCreations) {
      creatableNodeTypes.add(creation.nodeType);
      const scope = scopeKeyFor('node', creation.nodeType);
      for (const variableId of creation.writesAtCreation) {
        recordWrite(scope, variableId, creation.stageIndex);
      }
      // A prompt's fixed values are written onto the node as surely as a form
      // field is, so they belong in the write set — the plan needs a value for
      // them, and a later stage rewriting one makes the fixed value an
      // intermediate rather than the entity's final state.
      for (const fixed of creation.promptFixedValues) {
        for (const variableId of Object.keys(fixed)) {
          recordWrite(scope, variableId, creation.stageIndex);
        }
      }
    }
    for (const creation of summary.edgeCreations) {
      const list = edgeCreationsByType.get(creation.edgeType) ?? [];
      list.push(creation);
      edgeCreationsByType.set(creation.edgeType, list);
      const scope = scopeKeyFor('edge', creation.edgeType);
      for (const variableId of creation.writesAtCreation) {
        recordWrite(scope, variableId, creation.stageIndex);
      }
    }
    for (const write of summary.writes) {
      const scope = scopeKeyFor(write.entity, write.entityType);
      recordWrite(scope, write.variableId, write.stageIndex);
      if (write.filter === undefined && summary.stage.skipLogic === undefined) {
        recordRewrite(scope, write.variableId, write.stageIndex);
      }
    }
  }

  // Codebook types no stage names simply never appear in these sets; the
  // planner resolves their counts (and topologies) against membership here.
  return {
    stages: summaries,
    creatableNodeTypes,
    edgeCreationsByType,
    writeIndex,
    rewriteIndex,
  };
}
