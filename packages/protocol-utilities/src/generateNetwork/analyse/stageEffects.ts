import type {
  EdgeTopology,
  Stage,
  SyntheticCount,
} from '@codaco/protocol-validation';

import { isContentStage } from '../contentStages';
import {
  defaultTopologyForStage,
  DEFAULT_NODE_COUNT,
} from '../plan/resolveSynthetic';
import {
  type NodeVariablesFor,
  withRuleTiedVariables,
} from './ruleTiedVariables';

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
  stageId: string;
  stageIndex: number;
  nodeType: string;
  source: 'fabricated' | 'roster' | 'pedigree' | 'composer';
  capacity: StageCapacity;
  /**
   * How many people this stage declares it produces, resolved from its own
   * `synthetic.count` or the documented default.
   *
   * A count belongs to the asking, not the asked-about: three name generators
   * over one node type each nominate their own people, and nothing in the
   * protocol says how a single declared population would divide between them.
   *
   * Absent for a pedigree alone — a family is a structure rather than a
   * population, so its size comes from the specialist generator.
   */
  count?: SyntheticCount;
  /**
   * Whether {@link count} is the author's or the resolved default.
   *
   * A roster stage is held to a DECLARED count — asking for more people than
   * the roster holds is a protocol the researcher needs to hear about. An
   * undeclared one is only using the generic 1-8 fallback, which says nothing
   * about this roster, so it takes what the pool offers instead of refusing.
   */
  countDeclared: boolean;
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
  stageId: string;
  stageIndex: number;
  edgeType: string;
  /** Node type supplying both endpoints. */
  subjectNodeType: string;
  /**
   * How densely this stage declares it links what it can see, resolved from
   * its own `synthetic.topology` or the documented default.
   *
   * Resolved against the pairs eligible AT THIS STAGE — its subject type, its
   * filter, and the nodes that exist by the time it runs — so unlike a
   * whole-network target it is well defined during the interview walk. A stage
   * whose prompts create several edge types applies this to each of them
   * independently.
   *
   * Absent for a pedigree alone, whose links are structural.
   */
  topology?: EdgeTopology;
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
  /**
   * Where this creation sits in its stage's own sequence.
   *
   * A stage whose prompts create different edge types presents them in prompt
   * order, and the interview re-reads its filter against the network as it
   * changes — so a prompt creating type A can remove the endpoints the next
   * prompt would have paired. Planning the types in codebook order instead
   * planned the later prompt's type over subjects the earlier one had already
   * taken away. Zero where a creation has no prompt of its own.
   */
  promptIndex: number;
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
  /**
   * The node type supplying the pairs a census walked. Set only where the
   * write is confined to those pairs rather than reaching the whole edge type.
   */
  subjectNodeType?: string;
  /**
   * Which of its stage's prompts collects this write, where one does.
   *
   * A stage's prompts are separate screens shown in order, and the interview's
   * filtered network is a live selector — so what one prompt writes decides
   * who the NEXT prompt is shown. Materialisation replays a stage's effects in
   * this order for that reason; grouped by operation instead, every edge the
   * stage creates was made before any of its writes had landed, so a prompt
   * that marks people ran too late to keep a later prompt from linking them.
   *
   * Absent for a write no single prompt owns — a form's fields, a composer's
   * hull — which the stage presents as one pass over everything it can reach.
   */
  promptIndex?: number;
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
  /**
   * The node-form fields the interface actually renders — see
   * {@link pedigreeFormFields} for the ones it suppresses.
   */
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
   * Per entity scope, the variables at least one write reaches without passing
   * a stage filter.
   *
   * A filtered write lands on the subset the filter admits, which is decided
   * by the session as it stands when that stage runs — something the plan
   * cannot know, since the filter may test the very values being drawn. So a
   * variable only ever written behind a filter is left out of the plan and
   * drawn during the walk, against the filtered set the materialiser resolves.
   * Planning it for the whole type instead would claim a `unique` value for
   * every entity when the session gives it to a few, exhausting a value space
   * feasibility — which does not count filtered writes against a type either —
   * had already accepted.
   */
  unconditionalWrites: Map<string, Set<string>>;
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
  /**
   * Per entity scope, the EARLIEST stage that writes each variable.
   *
   * `writeIndex` records the last writer, which is what decides an entity's
   * final value. This records the first, which is when a value starts to
   * exist: before it, the session holds nothing for that variable, so a stage
   * filtering on it sees an unanswered entity however the plan ends up.
   */
  firstWriteIndex: Map<string, Map<string, number>>;
  /**
   * The first write of each variable that reaches EVERY entity of its scope —
   * the first one behind no filter.
   *
   * `firstWriteIndex` answers "when does this variable first get written
   * anywhere", which is population-wide only when that write is unconditional.
   * Where the first writer is filtered, the entities it excluded still hold
   * nothing until a later unconditional writer reaches them, and projecting
   * the value from the filtered stage onward showed it on every entity: a
   * following filtered stage then admitted subjects the live session excludes,
   * and the same-stage edges planned for them are not rechecked at
   * materialisation.
   */
  firstUnconditionalWriteIndex: Map<string, Map<string, number>>;
  /**
   * Per entity scope, EVERY stage index at which each variable is written, in
   * ascending order.
   *
   * The first/last indexes above answer population-wide questions, but an
   * entity is only reached by writes that run while it exists: a form that has
   * already run cannot land on a person a later generator introduces. Judging
   * a projection by the scope-global first writer showed such a person holding
   * a value the live session never gave them, so per-entity questions need the
   * whole list — is there any write between this entity's creation and the
   * stage being judged?
   */
  writeStages: Map<string, Map<string, readonly number[]>>;
  /**
   * As {@link StageEffects.writeStages}, restricted to writes behind no stage
   * filter — the ones certain to reach every entity alive when they run.
   */
  unconditionalWriteStages: Map<string, Map<string, readonly number[]>>;
  /**
   * Variables written as a Sociogram HIGHLIGHT, per scope.
   *
   * A highlight is a mark on a minority of the people in front of the
   * participant rather than an ordinary boolean answer, and it has its own
   * undeclared rate — see `DEFAULT_HIGHLIGHT_PROBABILITY`. The draw cannot
   * tell one boolean from another without being told which is which.
   */
  highlightVariables: Map<string, Set<string>>;
};

/**
 * An entity's attributes as the session holds them when `stageIndex` runs:
 * everything written by then, and nothing a later stage has yet to ask.
 *
 * The plan settles final values up front, so handing them to a filter would
 * answer with the end of the interview rather than its middle — admitting
 * subjects on a value the stage could not yet have collected.
 */
export function attributesAsOf(
  effects: StageEffects,
  scope: string,
  attributes: Record<string, unknown>,
  stageIndex: number,
  /**
   * What the creating interaction wrote, where that differs from the final
   * value. Until a later stage overwrites it the session still shows this, so
   * a filter evaluated in between has to see it: reading the final value made
   * the planner select a different subject domain from the real stage and emit
   * missing or extra edges.
   */
  fixedAtCreation?: Record<string, unknown>,
  /**
   * Whether the run respects filters. With filters ignored, every write
   * reaches every entity and the first write of any kind is the honest
   * answer; with them respected, only an unconditional write is certain to
   * have reached THIS entity, so that is what makes the value visible.
   *
   * Conservative in the direction that matters: showing a value too early
   * admits subjects the live session excludes, and the same-stage edges
   * planned for them are never rechecked. Showing it too late leaves a subject
   * out of a domain it might have joined, which plans fewer edges rather than
   * wrong ones.
   */
  respectFiltering = false,
  /**
   * The stage this entity was created at. A write that ran before the entity
   * existed cannot have landed on it, so a value is only visible where some
   * write falls between creation and `stageIndex` — without this, a form
   * whose only run precedes a later generator projected its answer onto the
   * people that generator introduces, people the live session leaves
   * unanswered. Omitted, no lower bound applies, which is the reading for a
   * caller with no per-entity creation to offer.
   */
  createdAt?: number,
): Record<string, unknown> {
  const writes = respectFiltering
    ? effects.unconditionalWriteStages.get(scope)
    : effects.writeStages.get(scope);
  if (writes === undefined) return {};
  const projected: Record<string, unknown> = {};
  // The union of final and creation-time keys, not the final keys alone. A
  // final value planned MISSING is an absent key, but where the creating
  // interaction fixed a value the session still holds it until the rewrite
  // runs — iterating `attributes` by itself hid exactly those values from
  // every stage between creation and rewrite, excluding entities the live
  // session includes.
  const keys = new Set([
    ...Object.keys(attributes),
    ...Object.keys(fixedAtCreation ?? {}),
  ]);
  for (const variableId of keys) {
    const stages = writes.get(variableId);
    const first = stages?.[0];
    if (first === undefined || first > stageIndex) continue;
    const settledAtCreation =
      fixedAtCreation !== undefined && variableId in fixedAtCreation;
    // A creation-settled value was written by the interaction that made this
    // entity, so it exists from `createdAt` by construction — a roster row's
    // data, say, carries no write of its own in the scope's index. Everything
    // else arrives through a population write, which reaches this entity only
    // if it runs while the entity exists.
    if (
      !settledAtCreation &&
      createdAt !== undefined &&
      !stages!.some((at) => at >= createdAt && at <= stageIndex)
    ) {
      continue;
    }
    const rewrite = effects.rewriteIndex.get(scope)?.get(variableId);
    // The fixed value stands until its rewrite has RUN; from then on the
    // final value — or, where the plan leaves it unanswered, nothing — is
    // what the session shows.
    if (
      settledAtCreation &&
      !(rewrite !== undefined && rewrite <= stageIndex)
    ) {
      projected[variableId] = fixedAtCreation[variableId];
    } else if (variableId in attributes) {
      projected[variableId] = attributes[variableId];
    }
  }
  return projected;
}

/** Scope key for `writeIndex`, matching the constraint machinery's. */
export const scopeKeyFor = (entity: string, type?: string): string =>
  entity === 'ego' ? 'ego' : `${entity}:${type}`;

/**
 * The variables the plan draws for one entity scope: those some stage writes,
 * less — where filtering is respected — those no stage writes except behind a
 * filter. See {@link StageEffects.unconditionalWrites}.
 */
export function writtenVariables(
  effects: StageEffects,
  entity: string,
  type?: string,
  respectFiltering = false,
): Set<string> {
  const scope = scopeKeyFor(entity, type);
  const written = new Set(effects.writeIndex.get(scope)?.keys() ?? []);
  if (!respectFiltering) return written;
  const unconditional = effects.unconditionalWrites.get(scope);
  return new Set(
    [...written].filter(
      (variableId) => unconditional?.has(variableId) === true,
    ),
  );
}

/**
 * The variables some stage writes onto entities of a scope that it did NOT
 * itself create — forms, bins, censuses, layouts.
 *
 * These reach the whole population, so every entity of the type is a
 * candidate. Creation-time writes are the other half and belong to the people
 * one creator made: a value only one of two creators collects is not drawn for
 * the type at large, or it spends `unique` values on entities the session
 * never writes it to.
 */
export function populationWrittenVariables(
  effects: StageEffects,
  entity: string,
  type?: string,
  respectFiltering = false,
): Set<string> {
  const scope = scopeKeyFor(entity, type);
  const written = new Set<string>();
  for (const summary of effects.stages) {
    for (const write of summary.writes) {
      if (write.mode === 'creation') continue;
      if (scopeKeyFor(write.entity, write.entityType) !== scope) continue;
      written.add(write.variableId);
    }
  }
  if (!respectFiltering) return written;
  const unconditional = effects.unconditionalWrites.get(scope);
  return new Set(
    [...written].filter(
      (variableId) => unconditional?.has(variableId) === true,
    ),
  );
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
 * The node-form fields a FamilyPedigree renders.
 *
 * PersonNameField owns the wizard's internal `name` path, so a form field with
 * that id is suppressed by the live interface, as is a form field duplicating
 * the configured label variable. A suppressed field is never asked and so is
 * never written.
 */
const pedigreeFormFields = (
  nodeConfig: StageOf<'FamilyPedigree'>['nodeConfig'] | undefined,
): string[] => {
  const labelVariable = nodeConfig?.nodeLabelVariable;
  return definedStrings(
    (nodeConfig?.form ?? []).map((field) => field.variable),
  ).filter((variable) => variable !== labelVariable && variable !== 'name');
};

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

/**
 * A stage that contributes nothing, keeping its position so consumers can
 * still address stages by index.
 */
const emptySummary = (stage: Stage, index: number): StageEffectSummary => ({
  index,
  stage,
  kind: 'content',
  metadataKind: null,
  nodeCreations: [],
  edgeCreations: [],
  writes: [],
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
        stageId: stage.id,
        countDeclared: false,
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
        stageId: stage.id,
        countDeclared: false,
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
        stageId: stage.id,
        countDeclared: false,
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
      for (const [promptIndex, prompt] of promptsOf(stage.prompts).entries()) {
        const layoutVariable = prompt.layout?.layoutVariable;
        if (layoutVariable !== undefined) {
          summary.writes.push({
            stageIndex: index,
            entity: 'node',
            entityType: nodeType,
            variableId: layoutVariable,
            ...(stage.filter ? { filter: stage.filter } : {}),
            promptIndex,
            mode: 'layout',
          });
        }
        // Edge creation wins where a prompt somehow carries both: the schema
        // refuses that pairing, and Sociogram's tap handler takes the
        // edge-creating branch first, leaving the toggle unreachable.
        if (
          prompt.highlight?.allowHighlighting &&
          prompt.highlight.variable &&
          !prompt.edges?.create
        ) {
          summary.writes.push({
            stageIndex: index,
            entity: 'node',
            entityType: nodeType,
            variableId: prompt.highlight.variable,
            ...(stage.filter ? { filter: stage.filter } : {}),
            promptIndex,
            mode: 'highlight',
          });
        }
        if (prompt.edges?.create) {
          summary.edgeCreations.push({
            stageId: stage.id,
            stageIndex: index,
            promptIndex,
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
      for (const [promptIndex, prompt] of promptsOf(stage.prompts).entries()) {
        if (prompt.createEdge === undefined) continue;
        summary.edgeCreations.push({
          stageId: stage.id,
          stageIndex: index,
          promptIndex,
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
      for (const [promptIndex, prompt] of promptsOf(stage.prompts).entries()) {
        if (prompt.createEdge === undefined) continue;
        summary.edgeCreations.push({
          stageId: stage.id,
          stageIndex: index,
          promptIndex,
          edgeType: prompt.createEdge,
          subjectNodeType: nodeType,
          ...(stage.filter ? { filter: stage.filter } : {}),
          ownNodesOnly: false,
          recordsNegatives: 'tieStrength',
          writesAtCreation: definedStrings([prompt.edgeVariable]),
          structured: null,
        });
        if (prompt.edgeVariable === undefined) continue;
        // Scoped to the pairs the census walks. The interface asks about its
        // own subjects and writes the strength only where it answered
        // positively, so a type-wide write would put the ordinal on edges
        // between people this census never considered.
        summary.writes.push({
          stageIndex: index,
          entity: 'edge',
          entityType: prompt.createEdge,
          variableId: prompt.edgeVariable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          subjectNodeType: nodeType,
          promptIndex,
          mode: 'tieStrength',
        });
      }
      break;
    }

    case 'OrdinalBin':
    case 'CategoricalBin': {
      const nodeType = subjectTypeOf(stage.subject);
      if (nodeType === undefined) break;
      for (const [promptIndex, prompt] of promptsOf(stage.prompts).entries()) {
        if (prompt.variable === undefined) continue;
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: nodeType,
          variableId: prompt.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          promptIndex,
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
      const formFields = pedigreeFormFields(nodeConfig);
      summary.nodeCreations.push({
        stageId: stage.id,
        countDeclared: false,
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
        stageId: stage.id,
        stageIndex: index,
        promptIndex: 0,
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
      for (const [promptIndex, prompt] of promptsOf(stage.prompts).entries()) {
        if (prompt.variable === undefined) continue;
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: nodeType,
          variableId: prompt.variable,
          ...(stage.filter ? { filter: stage.filter } : {}),
          promptIndex,
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
        stageId: stage.id,
        countDeclared: false,
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
      // The node form is not creation-only. The canvas holds every node of the
      // subject type the session has, and its inspector opens that form for any
      // of them, so a person an earlier stage introduced is asked the same
      // questions. Recorded only as creation writes, their planned answers
      // would never be landed and the finished session would be missing
      // answers the composer visibly collected. `quickAdd` stays creation-only:
      // it names someone as they are added and is not asked again.
      // A composer declares no stage filter, so the write reaches the whole
      // subject type — exactly the set the canvas is loaded with.
      //
      // The hull variable joins the form fields for the same reason. Group
      // membership is toggled with the composer's own tools, which act on
      // whatever is on the canvas: keeping it a creation write would land the
      // planned memberships on the composer's own people alone and leave
      // everyone introduced earlier out of every group.
      for (const variableId of definedStrings([
        ...formVariables(stage.nodeForm),
        stage.convexHullVariable,
      ])) {
        summary.writes.push({
          stageIndex: index,
          entity: 'node',
          entityType: nodeType,
          variableId,
          mode:
            variableId === stage.convexHullVariable ? 'composerHull' : 'form',
        });
      }
      for (const [promptIndex, edge] of (stage.edges ?? []).entries()) {
        const edgeType = subjectTypeOf(edge.subject);
        if (edgeType === undefined) continue;
        summary.edgeCreations.push({
          stageId: stage.id,
          stageIndex: index,
          promptIndex,
          edgeType,
          subjectNodeType: nodeType,
          // The canvas is loaded from `getNetworkNodesForType`, which is every
          // node of the subject type the session holds — not only the ones
          // this stage added. A participant can therefore join two people an
          // earlier stage introduced, so restricting the domain to the
          // composer's own people would plan no edges at all wherever the
          // population arrived before it.
          ownNodesOnly: false,
          recordsNegatives: null,
          writesAtCreation: formVariables(edge.form),
          structured: null,
        });
        // And the edge form is no more creation-only than the node form: the
        // inspector opens it for any edge on the canvas, including ones a
        // Sociogram drew before this stage ran, whose planned values would
        // otherwise never be landed.
        for (const variableId of formVariables(edge.form)) {
          summary.writes.push({
            stageIndex: index,
            entity: 'edge',
            entityType: edgeType,
            variableId,
            mode: 'form',
          });
        }
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

  // Stamped once here rather than at each push site, so a stage type added
  // later cannot silently arrive without its declared population.
  //
  // A pedigree is the deliberate exception: it declares no `synthetic` block,
  // and the planner skips its creations entirely, so leaving count and
  // topology absent is what says "sized by the specialist generator" rather
  // than "defaulted to something nothing reads".
  const declared = 'synthetic' in stage ? stage.synthetic : undefined;
  const declaredCount =
    declared !== undefined && 'count' in declared ? declared.count : undefined;
  const declaredTopology =
    declared !== undefined && 'topology' in declared
      ? declared.topology
      : undefined;

  for (const creation of summary.nodeCreations) {
    creation.stageId = stage.id;
    if (creation.source !== 'pedigree') {
      creation.count = declaredCount ?? DEFAULT_NODE_COUNT;
      creation.countDeclared = declaredCount !== undefined;
    }
  }
  for (const creation of summary.edgeCreations) {
    creation.stageId = stage.id;
    if (creation.structured !== 'pedigree') {
      creation.topology =
        declaredTopology ?? defaultTopologyForStage(stage.type);
    }
  }

  return summary;
}

/**
 * @param reachable Indexes of the stages the run can actually arrive at, when
 * skip logic is respected. A stage proven unreachable contributes nothing: it
 * creates nobody and writes nothing, so planning a share of a population for
 * it would leave that share unbuilt (materialisation skips the stage and does
 * not reallocate) and would spend `unique` values on entities the session
 * never holds. Its index is kept so every consumer still addresses stages by
 * position. Omitted means every stage is reachable, which is the reading when
 * skip logic is not respected.
 */
export function analyseStageEffects(
  stages: Stage[],
  reachable?: ReadonlySet<number>,
): StageEffects {
  const summaries = stages.map((stage, index) =>
    reachable === undefined || reachable.has(index)
      ? summariseStage(stage, index)
      : emptySummary(stage, index),
  );

  const creatableNodeTypes = new Set<string>();
  const edgeCreationsByType = new Map<string, EdgeCreation[]>();
  const writeIndex = new Map<string, Map<string, number>>();
  const rewriteIndex = new Map<string, Map<string, number>>();
  const unconditionalWrites = new Map<string, Set<string>>();

  const firstUnconditionalWriteIndex = new Map<string, Map<string, number>>();
  const highlightVariables = new Map<string, Set<string>>();

  // Accumulated as sets — one stage can write a variable through several
  // interactions — and sorted into the exposed lists once the walk is done.
  const writeStageSets = new Map<string, Map<string, Set<number>>>();
  const unconditionalWriteStageSets = new Map<
    string,
    Map<string, Set<number>>
  >();
  const addWriteStage = (
    sets: Map<string, Map<string, Set<number>>>,
    scope: string,
    variableId: string,
    at: number,
  ): void => {
    const forScope = sets.get(scope) ?? new Map<string, Set<number>>();
    const forVariable = forScope.get(variableId) ?? new Set<number>();
    forVariable.add(at);
    forScope.set(variableId, forVariable);
    sets.set(scope, forScope);
  };
  const sortedWriteStages = (
    sets: Map<string, Map<string, Set<number>>>,
  ): Map<string, Map<string, readonly number[]>> =>
    new Map(
      [...sets].map(([scope, forScope]) => [
        scope,
        new Map(
          [...forScope].map(([variableId, at]) => [
            variableId,
            [...at].toSorted((a, b) => a - b),
          ]),
        ),
      ]),
    );

  const recordUnconditional = (
    scope: string,
    variableId: string,
    at: number,
  ): void => {
    const forScope = unconditionalWrites.get(scope) ?? new Set<string>();
    forScope.add(variableId);
    unconditionalWrites.set(scope, forScope);
    const firstFor =
      firstUnconditionalWriteIndex.get(scope) ?? new Map<string, number>();
    firstFor.set(variableId, Math.min(firstFor.get(variableId) ?? at, at));
    firstUnconditionalWriteIndex.set(scope, firstFor);
    addWriteStage(unconditionalWriteStageSets, scope, variableId, at);
  };

  const recordInto =
    (index: Map<string, Map<string, number>>) =>
    (scope: string, variableId: string, at: number): void => {
      const forScope = index.get(scope) ?? new Map<string, number>();
      forScope.set(variableId, Math.max(forScope.get(variableId) ?? -1, at));
      index.set(scope, forScope);
    };
  const firstWriteIndex = new Map<string, Map<string, number>>();
  const recordLastWrite = recordInto(writeIndex);
  const recordWrite = (scope: string, variableId: string, at: number): void => {
    recordLastWrite(scope, variableId, at);
    const forScope = firstWriteIndex.get(scope) ?? new Map<string, number>();
    forScope.set(variableId, Math.min(forScope.get(variableId) ?? at, at));
    firstWriteIndex.set(scope, forScope);
    addWriteStage(writeStageSets, scope, variableId, at);
  };
  const recordRewrite = recordInto(rewriteIndex);

  for (const summary of summaries) {
    for (const creation of summary.nodeCreations) {
      creatableNodeTypes.add(creation.nodeType);
      const scope = scopeKeyFor('node', creation.nodeType);
      for (const variableId of creation.writesAtCreation) {
        recordWrite(scope, variableId, creation.stageIndex);
        // A creating interaction reaches every entity it makes, so what it
        // writes is never behind a filter.
        recordUnconditional(scope, variableId, creation.stageIndex);
      }
      // A prompt's fixed values are written onto the node as surely as a form
      // field is, so they belong in the write set — the plan needs a value for
      // them, and a later stage rewriting one makes the fixed value an
      // intermediate rather than the entity's final state.
      for (const fixed of creation.promptFixedValues) {
        for (const variableId of Object.keys(fixed)) {
          recordWrite(scope, variableId, creation.stageIndex);
          recordUnconditional(scope, variableId, creation.stageIndex);
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
        recordUnconditional(scope, variableId, creation.stageIndex);
      }
    }
    for (const write of summary.writes) {
      const scope = scopeKeyFor(write.entity, write.entityType);
      recordWrite(scope, write.variableId, write.stageIndex);
      if (write.mode === 'highlight') {
        const forScope = highlightVariables.get(scope) ?? new Set<string>();
        forScope.add(write.variableId);
        highlightVariables.set(scope, forScope);
      }
      if (write.filter === undefined) {
        recordUnconditional(scope, write.variableId, write.stageIndex);
      }
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
    unconditionalWrites,
    rewriteIndex,
    firstWriteIndex,
    firstUnconditionalWriteIndex,
    writeStages: sortedWriteStages(writeStageSets),
    unconditionalWriteStages: sortedWriteStages(unconditionalWriteStageSets),
    highlightVariables,
  };
}

/**
 * Feasibility counting reads the same model one stage at a time, before the
 * protocol has a plan to index against: it walks the reachable stages itself,
 * asking of each what it would write onto the people it makes and onto the
 * people it finds. The queries below answer from the summaries above, so the
 * switch over stage types stays in one place — a second reading of the schemas
 * is exactly what lets a counter accept a protocol the walk then fails on.
 *
 * The FamilyPedigree ones read `nodeConfig` rather than
 * {@link StageEffectSummary.pedigree}, which describes the family's edges too
 * and so stands down when no edge type is configured. A stage that names people
 * but no link between them still writes onto those people, and the deliberately
 * partial fixtures feasibility is tested against rely on that.
 */

/**
 * One stage's summary, read out of protocol order. The stage indices it carries
 * mean nothing to these callers, which ask only what a stage writes;
 * {@link lastExistingWriterByType} supplies the real index itself.
 */
const writeSummary = (stage: Stage): StageEffectSummary =>
  summariseStage(stage, 0);

/** Variables rendered as ordinary fields or labels by FamilyPedigree. */
export function pedigreeDrawnNodeVariables(stage: Stage): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();
  const { nodeConfig } = stage;
  return new Set(
    definedStrings([
      nodeConfig?.nodeLabelVariable,
      ...pedigreeFormFields(nodeConfig),
    ]),
  );
}

/**
 * Disease and nomination variables the pedigree materialiser fixes.
 *
 * A NarrativePedigree presents the family its source stage built, and the
 * diseases it reads have to be on those people before it runs — so the stage
 * that built them is the one that writes them.
 */
function pedigreeFixedNodeVariables(
  stage: Stage,
  stages: readonly Stage[],
): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();

  const variables = new Set(
    definedStrings(
      (stage.nominationPrompts ?? []).map((prompt) => prompt.variable),
    ),
  );
  for (const candidate of stages) {
    if (
      candidate.type !== 'NarrativePedigree' ||
      candidate.sourceStageId !== stage.id
    ) {
      continue;
    }
    for (const disease of candidate.diseases) variables.add(disease.variable);
  }
  return variables;
}

/** Every node variable FamilyPedigree can write while creating its people. */
export function pedigreeNodeVariables(
  stage: Stage,
  stages: readonly Stage[] = [stage],
): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();
  const { nodeConfig } = stage;
  return new Set(
    definedStrings([
      ...pedigreeDrawnNodeVariables(stage),
      nodeConfig?.egoVariable,
      nodeConfig?.relationshipVariable,
      nodeConfig?.biologicalSexVariable,
      ...pedigreeFixedNodeVariables(stage, stages),
    ]),
  );
}

/** Variables written on FamilyPedigree's one iconic ego node. */
export function pedigreeEgoNodeVariables(
  stage: Stage,
  stages: readonly Stage[] = [stage],
  variables?: Record<string, unknown>,
): Set<string> {
  if (stage.type !== 'FamilyPedigree') return new Set();
  const { nodeConfig } = stage;

  const directlyWritten = new Set(
    definedStrings([
      nodeConfig?.egoVariable,
      nodeConfig?.biologicalSexVariable,
      ...pedigreeFixedNodeVariables(stage, stages),
    ]),
  );
  const connected = withRuleTiedVariables(variables, directlyWritten);

  // Name and additional node-form controls are rendered only for relatives.
  // Do not let a cross-variable rule turn an unrendered ego control into a
  // synthetic write. A variable that is also written semantically (for
  // example, an imported conflicting biological-sex form field) remains fixed.
  for (const variable of pedigreeDrawnNodeVariables(stage)) {
    if (!directlyWritten.has(variable)) connected.delete(variable);
  }

  return connected;
}

/**
 * The node variables a creating stage fills on the nodes it creates, optionally
 * narrowed to the ones added under a single prompt.
 */
export function nodeVariablesWrittenOnCreation(
  stage: Stage,
  stages: readonly Stage[] = [stage],
  promptIndex?: number,
): Set<string> {
  // A pedigree's people carry the semantics the interface owns as well as the
  // fields it renders, and nothing about them is per-prompt.
  if (stage.type === 'FamilyPedigree')
    return pedigreeNodeVariables(stage, stages);

  const written = new Set<string>();
  for (const creation of writeSummary(stage).nodeCreations) {
    for (const variableId of creation.writesAtCreation) written.add(variableId);
    const fixedValues =
      promptIndex === undefined
        ? creation.promptFixedValues
        : [creation.promptFixedValues[promptIndex] ?? {}];
    for (const fixed of fixedValues) {
      for (const variableId of Object.keys(fixed)) written.add(variableId);
    }
  }
  return written;
}

/**
 * Whether a stage declares a collection surface for the nodes it creates.
 *
 * A roster's rows decide what is present, so it keeps the former whole-type
 * fill for values a row omits. An incomplete hand-built fixture with neither
 * fields nor prompt assignments gets the same conservative fallback: it may
 * over-count, but cannot let a real draw run out after feasibility
 * under-counted it.
 */
export function declaresNodeCollection(
  stage: Stage,
  promptIndex?: number,
): boolean {
  if (stage.type === 'NameGeneratorRoster') return false;
  return nodeVariablesWrittenOnCreation(stage, [stage], promptIndex).size > 0;
}

/**
 * Whether a stage filter can admit at most one node of a type, provably and
 * without a network to evaluate against.
 *
 * The only shape that proves it is an equality test on a `unique` attribute:
 * uniqueness says no two nodes of the type hold the same value, so a rule
 * demanding one particular value matches one node at most. Under `AND` a
 * single such rule settles the whole filter, since the others can only narrow
 * further. Under `OR` each rule contributes its own matches, so nothing is
 * proven. Everything else is left unproven on purpose: being wrong here in the
 * permissive direction is what lets a run die half-built.
 */
function filterAdmitsAtMostOneNode(
  filter: StageFilter | undefined,
  nodeType: string,
  variablesFor?: NodeVariablesFor,
): boolean {
  const rules = filter?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return false;
  // `network-query` defaults an absent join to OR, which proves nothing.
  if (rules.length > 1 && filter?.join !== 'AND') return false;

  const variables = variablesFor?.(nodeType);
  if (variables === undefined) return false;

  return rules.some((rule) => {
    const { type, options } = rule as {
      type?: unknown;
      options?: { type?: unknown; attribute?: unknown; operator?: unknown };
    };
    if (type !== 'node' || options?.type !== nodeType) return false;
    if (options.operator !== 'EXACTLY') return false;
    const attribute = options.attribute;
    if (typeof attribute !== 'string') return false;
    const definition = variables[attribute];
    if (typeof definition !== 'object' || definition === null) return false;
    return (
      (definition as { validation?: { unique?: unknown } }).validation
        ?.unique === true
    );
  });
}

/**
 * Variables a stage writes onto nodes that existed before it ran, by node type.
 *
 * Creation-time writes are excluded: they land on the stage's own new people,
 * and are counted where those people are counted.
 */
function writesOnExistingNodes(
  stage: Stage,
  stages: readonly Stage[],
  variablesFor?: NodeVariablesFor,
  respectSkipLogicAndFiltering = false,
  /**
   * Count a filtered write against the whole type instead of passing it over.
   *
   * The two readers of this map want opposite things of a filtered write.
   * `rewriteIndex` asks which stage CERTAINLY rewrites a variable, and a
   * filtered write is not certain to reach any given entity, so it must be
   * left out. Feasibility asks how many entities COULD hold a value, and there
   * the same write must be counted — passing it over let a filtered form
   * writing a `unique` variable clear preflight at zero holders and then
   * exhaust the registry mid-walk.
   */
  countFilteredWrites = false,
): Map<string, Set<string>> {
  const byType = new Map<string, Set<string>>();
  const record = (nodeType: string, variableId: string): void => {
    const forType = byType.get(nodeType) ?? new Set<string>();
    forType.add(variableId);
    byType.set(nodeType, forType);
  };

  if (stage.type === 'FamilyPedigree') {
    // The live interface keeps earlier same-typed people in the family: the
    // materialiser clears the focal flag on each of them and normalises every
    // disease this stage introduces over them. Neither write is a nomination
    // prompt's, so neither appears in the summary's `writes`.
    const nodeType = stage.nodeConfig?.type;
    if (nodeType === undefined) return byType;
    const directlyWritten = new Set(
      definedStrings([
        stage.nodeConfig?.egoVariable,
        ...pedigreeFixedNodeVariables(stage, stages),
      ]),
    );
    for (const variableId of withRuleTiedVariables(
      variablesFor?.(nodeType),
      directlyWritten,
    )) {
      record(nodeType, variableId);
    }
    return byType;
  }

  for (const write of writeSummary(stage).writes) {
    if (write.entity !== 'node' || write.entityType === undefined) continue;
    // With filtering enabled, this write may reach only a subset of the
    // existing population. Promoting its variables to every earlier creation
    // would turn a one-node write into a whole-type feasibility demand. The
    // creation tally remains authoritative for variables written when those
    // nodes were made; filtered population writes are settled by the actual
    // filtered set at generation time.
    if (respectSkipLogicAndFiltering && write.filter !== undefined) {
      // A filter whose reach is provably one node can be passed over by either
      // reader: a single holder exhausts no value space that holds anything.
      if (
        !countFilteredWrites ||
        filterAdmitsAtMostOneNode(write.filter, write.entityType, variablesFor)
      ) {
        continue;
      }
    }
    record(write.entityType, write.variableId);
  }
  return byType;
}

/** Whether this stage can rewrite one variable on an existing node. */
export function stageWritesExistingNodeVariable(
  stage: Stage,
  stages: readonly Stage[],
  nodeType: string,
  variableId: string,
  variablesFor?: NodeVariablesFor,
): boolean {
  return (
    writesOnExistingNodes(stage, stages, variablesFor)
      .get(nodeType)
      ?.has(variableId) === true
  );
}

/** Last stage index writing each variable onto existing nodes, per node type. */
export function lastExistingWriterByType(
  stages: readonly Stage[],
  variablesFor?: NodeVariablesFor,
  respectSkipLogicAndFiltering = false,
  /** See {@link writesOnExistingNodes}; feasibility sets this, the plan does not. */
  countFilteredWrites = false,
): Map<string, Map<string, number>> {
  const byType = new Map<string, Map<string, number>>();

  for (const [stageIndex, stage] of stages.entries()) {
    const written = writesOnExistingNodes(
      stage,
      stages,
      variablesFor,
      respectSkipLogicAndFiltering,
      countFilteredWrites,
    );
    for (const [nodeType, variables] of written) {
      const forType = byType.get(nodeType) ?? new Map<string, number>();
      for (const variable of variables) {
        forType.set(
          variable,
          Math.max(forType.get(variable) ?? -1, stageIndex),
        );
      }
      byType.set(nodeType, forType);
    }
  }

  return byType;
}
