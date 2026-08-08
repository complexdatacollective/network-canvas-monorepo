import { resolveSkipLogicDestinationIndex } from '@codaco/network-query';
import {
  collectEntityAttributeReferences,
  collectEntityTypeReferences,
  type Stage,
  type StructuralCodebook,
  type ValidationContradiction,
  type Variables,
} from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_VALUES,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { FeasibilityConfig } from '../config';
import { isContentStage } from '../contentStages';
import {
  PEDIGREE_RELATIONSHIP_TO_EGO_VALUES,
  type ResolvedFamilyPedigreeGenerationOptions,
} from '../familyPedigree/types';
import {
  collectPromptFixedAssignments,
  countPromptFixedValues,
  countRosterCarriedValues,
  type PromptFixedValues,
  type RosterCarriedValues,
  ruleBrokenByFixedValues,
} from '../nodes';
import { resolveVariableSynthetic } from '../plan/resolveSynthetic';
import { getSubjectType } from '../subject';
import { collectBinOnlyVariables } from './binOnlyVariables';
import { buildEntityConstraints } from './buildConstraints';
import { type ComparatorEdge, resolveGenerationOrder } from './dependencyOrder';
import {
  edgeCountFor,
  inheritedContributorAncestryCeiling,
  nodeCountFor,
  pedigreeEdgeCeiling,
  pedigreeNodeCeiling,
  pedigreePossibleEdgeValues,
  unwrittenEdgeVariables,
  unwrittenNodeVariables,
  worstCaseEntityCounts,
} from './entityCounts';
import type { ConstraintConflict } from './error';
import { comparatorFoldEmptied } from './generateEntityAttributes';
import {
  differentFromGroups,
  emptyGroupBounds,
  groupComparatorEdges,
  intersectGroupConstraints,
  propagateComparatorBounds,
} from './groupConstraints';
import { solvableComponents, solveComponent } from './solver';
import {
  COMPARISON_RULES,
  type ConstrainedVariable,
  type EntityConstraints,
} from './types';
import { valueKey } from './uniqueRegistry';
import { delegatedValidationContradictions } from './validationContradictions';
import {
  distinctOptionValues,
  MAX_TEXT_DRAW_LENGTH,
  valueSpaceSize,
} from './valueSpace';

/**
 * Whether every entity's value for an equality group is certainly unanswered.
 *
 * The runtime's own `unique` validator exempts empty values — "required owns
 * emptiness; uniqueness begins only once a value is supplied" — so a group the
 * plan will null on every entity spends no unique values at all, and counting
 * its value space against the entities that carry it refuses a protocol that
 * would have generated perfectly well.
 *
 * The conditions mirror `applyMissingness` exactly, because this is only sound
 * while the two agree: a required member forbids missingness outright, a
 * probability below 1 leaves values that must be counted, and one member whose
 * value some interaction settles takes the whole group out of missingness —
 * a fixed value was never a question left unanswered.
 */
function certainlyMissing(
  members: readonly string[],
  scope: EntityScope,
): boolean {
  const variables = scope.variables;
  if (variables === undefined) return false;

  let highest = 0;
  for (const id of members) {
    if (
      scope.fixedValues.has(id) ||
      scope.pedigreeFixedValues.has(id) ||
      scope.rosterCarriedValues.has(id)
    ) {
      return false;
    }
    const variable = variables[id];
    if (variable === undefined) return false;
    const resolved = resolveVariableSynthetic(variable);
    if (resolved.kind === 'stageOwned') return false;
    if ('validation' in variable && variable.validation?.required === true) {
      return false;
    }
    highest = Math.max(highest, resolved.missingProbability);
  }
  return highest === 1;
}

type EntityScope = {
  entity: 'ego' | 'node' | 'edge';
  entityType?: string;
  entityTypeName?: string;
  variables: Variables | undefined;
  /** Variables of this type whose rules nothing in the interview applies. */
  unvalidated: ReadonlySet<string>;
  /**
   * How many distinct values of one equality group entities of this type can
   * spend between them. Asked of the group rather than of the type, because a
   * pedigree edge holds a value only for the variables some stage writes onto
   * it, and roster rows repeating one of the group's values spend it once
   * between them. Asked of the whole group at once rather than of its members
   * one at a time, because the members share a single value and a single
   * `unique` slot: what turns a roster row away is any of them, so no member's
   * count read on its own describes the group.
   */
  worstCaseCountFor: (variableIds: readonly string[]) => number;
  /** Values prompts write onto this type, and how many entities can hold each. */
  fixedValues: PromptFixedValues;
  /** The same, for the ego flag a FamilyPedigree stage pins on its own nodes. */
  pedigreeFixedValues: PromptFixedValues;
  /** The values roster rows of this type carry, and where they are offered. */
  rosterCarriedValues: RosterCarriedValues;
  /** Each prompt's whole set of values, as one entity ends up holding it. */
  fixedAssignments: readonly Record<string, VariableValue>[];
};

/**
 * Which writer put a value on an entity that the draw never got to choose: a
 * part of the protocol, or a roster row the researcher supplied.
 */
type FixedValueOrigin = 'prompt' | 'pedigree' | 'roster';

/** How many entities hold one fixed value, and what wrote it onto them. */
type FixedCarriers = {
  count: number;
  origins: Set<FixedValueOrigin>;
  /**
   * The last stage writing the value onto an entity whatever the registry holds
   * — the group's, folded from every member's `stampedAt`. `undefined` where
   * nothing writes it that way, which is what leaves a roster row carrying it
   * nothing to collide with.
   */
  stampedAt?: number;
};

const NO_UNVALIDATED_VARIABLES: ReadonlySet<string> = new Set();
const NO_FIXED_VALUES: PromptFixedValues = new Map();
const NO_ROSTER_VALUES: RosterCarriedValues = new Map();
const NO_FIXED_ASSIGNMENTS: readonly Record<string, VariableValue>[] = [];

// The reference-bearing constraints that can merge two variables into one
// group: `sameAs` directly, and a comparator as one link of a non-strict cycle.
const MERGING_RULES = ['sameAs', ...COMPARISON_RULES] as const;

// Reference-bearing constraint keys, checked against a cycle's members to
// report only the rules actually involved in it.
const REFERENCE_RULES = [...MERGING_RULES, 'differentFrom'] as const;

function namesOf(entity: EntityConstraints, ids: string[]): string[] {
  return ids.map((id) => entity.get(id)?.entry.name ?? id);
}

/**
 * What to call whatever wrote a fixed value, and the verb agreeing with it, so
 * the message points at the part of the protocol its author would edit.
 *
 * A roster is named alongside the protocol's own writer rather than folded into
 * "the protocol" with it. The two are edited in different places — one is a
 * prompt or a pedigree in the protocol, the other a column of the researcher's
 * data — and either one changing resolves the conflict, so naming only one of
 * them would send its reader to a file that is not necessarily the one they
 * meant to change.
 */
function fixedBy(origins: ReadonlySet<FixedValueOrigin>): {
  writers: string;
  verb: string;
} {
  const inProtocol = [...origins].filter((origin) => origin !== 'roster');

  if (inProtocol.length === 0) {
    return { writers: 'a roster row', verb: 'fixes' };
  }

  const writer =
    inProtocol.length > 1
      ? 'the protocol'
      : inProtocol[0] === 'pedigree'
        ? 'a family pedigree'
        : 'a prompt';

  return origins.has('roster')
    ? { writers: `${writer} and a roster row`, verb: 'fix' }
    : { writers: writer, verb: 'fixes' };
}

/** Folds one stage's written values into a per-type tally. */
function recordPinned(
  byType: Map<string, PromptFixedValues>,
  type: string,
  stageIndex: number,
  pinned: readonly (readonly [string, VariableValue, number])[],
): void {
  const forType = byType.get(type) ?? new Map();
  for (const [variableId, value, carriers] of pinned) {
    if (carriers === 0) continue;
    const forVariable = forType.get(variableId) ?? new Map();
    const key = valueKey(value);
    const carried = forVariable.get(key);
    forVariable.set(key, {
      value,
      count: (carried?.count ?? 0) + carriers,
      stampedAt: Math.max(carried?.stampedAt ?? stageIndex, stageIndex),
    });
    forType.set(variableId, forVariable);
  }
  byType.set(type, forType);
}

/**
 * The last stage index at which some handler REDRAWS each edge variable on
 * edges it did not create, per edge type — what tells a pedigree's written
 * value from one a later stage replaces.
 *
 * Two handlers do it, and both do it the same way when filtering is disabled:
 * `handleAlterEdgeForm` walks every existing edge of its subject type and calls
 * `generateAttributesForEntity` with its form's field ids as `only`;
 * `handleTieStrengthCensus` does the same for its prompt's `edgeVariable` over
 * the pairs it reuses as well as the ones it creates. Either way the pedigree's
 * literal is `existing` to a draw that releases it and issues another, so what
 * the finished edge holds is drawn, not written.
 *
 * Deliberately narrower than {@link EdgeCounts.named}, which answers the
 * placement question for the counts. That map is wide on purpose — any
 * reference resolving an edge subject keeps a variable's pedigree edges
 * counted, whether or not its stage would write them — because over-counting
 * holders only ever refuses more. Here the fail-safe runs the other way: a
 * naming site read as an overwriter DROPS a pin, and dropping one wrongly lets
 * a pedigree emit repeated fixed values for a `unique` variable. So this
 * asks only after handlers proven to redraw, and a new one taught to would
 * leave a refusal standing until it is listed — the same direction every other
 * unrecognised shape is read in.
 */
function regeneratedEdgeAttributes(
  stages: Stage[],
  respectSkipLogicAndFiltering: boolean,
): Map<string, Map<string, number>> {
  const regenerated = new Map<string, Map<string, number>>();

  const record = (type: string, variableId: string, at: number): void => {
    const forType = regenerated.get(type) ?? new Map<string, number>();
    forType.set(variableId, Math.max(forType.get(variableId) ?? -1, at));
    regenerated.set(type, forType);
  };

  for (const [stageIndex, stage] of stages.entries()) {
    const canBeBypassed = stages
      .slice(0, stageIndex)
      .some((earlier, earlierIndex) => {
        const destination = earlier.skipLogic?.destination;
        if (destination === undefined) return false;
        const destinationIndex = resolveSkipLogicDestinationIndex(
          destination,
          stages,
          earlierIndex,
        );
        return destinationIndex !== undefined && destinationIndex > stageIndex;
      });

    // A respected filter or skip rule can leave any pedigree edge untouched.
    // Retaining every pin is the safe upper bound; dropping one that survives
    // would admit duplicate fixed values on a `unique` variable.
    if (
      respectSkipLogicAndFiltering &&
      (stage.skipLogic !== undefined ||
        ('filter' in stage && stage.filter !== undefined) ||
        canBeBypassed)
    ) {
      continue;
    }

    if (stage.type === 'AlterEdgeForm') {
      const type = getSubjectType(stage.subject, 'edge');
      if (type === undefined) continue;
      for (const field of stage.form?.fields ?? []) {
        record(type, field.variable, stageIndex);
      }
      continue;
    }

    if (stage.type === 'TieStrengthCensus') {
      for (const prompt of stage.prompts) {
        const { createEdge, edgeVariable } = prompt;
        if (createEdge && edgeVariable) {
          record(createEdge, edgeVariable, stageIndex);
        }
      }
    }
  }

  return regenerated;
}

/**
 * The values each FamilyPedigree stage writes rather than draws, counted like a
 * prompt's fixed values so both reach the same refusal.
 *
 * On its nodes: the interface marks exactly one node of a pedigree as ego and
 * every other node it builds as not-ego, whatever the flag's declared type, so
 * a stage of `n` nodes pins `true` once and `false` `n - 1` times. On its
 * edges: the relationship, activity, carrier, and gamete semantics are fixed
 * by the semantic plan rather than drawn from the codebook. Their possible
 * values are counted at the conservative edge ceiling, for the same reason the
 * rest of feasibility counts worst cases, and summed across stages because a
 * `unique` value is claimed once for the whole run.
 *
 * A pedigree writes without consulting the registry, so every pin is stamped
 * where its stage runs — the tally's `stampedAt`, which is what a roster row
 * carrying the same value is weighed against.
 *
 * An edge value is a pin only while it is the last word on that variable. A
 * stage running LATER regenerates it on the very edges the pedigree built, and
 * what those edges end up holding is then drawn against the variable's rules
 * like any other value — so counting the literal there would refuse a `unique`
 * relationship type the form has options enough to tell apart. Strictly later,
 * because a stage runs before the pedigree never meets its edges: they do not
 * exist yet, so its regeneration passes over them and the pins stand. That is
 * the same at-or-after reading `edgeCountFor` gives a writer's placement, asked
 * of {@link regeneratedEdgeAttributes} rather than of the counts' own map for
 * the reason recorded there.
 */
function countPedigreeFixedValues(
  stages: Stage[],
  config: FeasibilityConfig,
  respectSkipLogicAndFiltering: boolean,
  nodeBeforeStage: ReadonlyMap<number, ReadonlyMap<string, number>>,
  familyPedigree?: ResolvedFamilyPedigreeGenerationOptions,
): {
  node: Map<string, PromptFixedValues>;
  edge: Map<string, PromptFixedValues>;
} {
  const node = new Map<string, PromptFixedValues>();
  const edge = new Map<string, PromptFixedValues>();
  const regenerated = regeneratedEdgeAttributes(
    stages,
    respectSkipLogicAndFiltering,
  );

  for (const [stageIndex, stage] of stages.entries()) {
    if (stage.type !== 'FamilyPedigree') continue;
    const pedigreeContext = familyPedigree
      ? { options: familyPedigree, stage, stages }
      : undefined;
    const nodeType = stage.nodeConfig?.type;
    const inheritedContributorCeiling = inheritedContributorAncestryCeiling(
      stageIndex,
      stages,
      nodeType === undefined
        ? 0
        : (nodeBeforeStage.get(stageIndex)?.get(nodeType) ?? 0),
      familyPedigree,
    );
    const ceiling =
      pedigreeNodeCeiling(config, pedigreeContext) +
      inheritedContributorCeiling.nodes;

    const egoVariable = stage.nodeConfig?.egoVariable;
    if (nodeType !== undefined) {
      const fixed: [string, VariableValue, number][] = [];
      if (egoVariable !== undefined) {
        fixed.push(
          [egoVariable, true, Math.min(ceiling, 1)],
          [egoVariable, false, Math.max(ceiling - 1, 0)],
        );
      }
      const relationshipVariable = stage.nodeConfig?.relationshipVariable;
      if (relationshipVariable !== undefined) {
        fixed.push(
          ...PEDIGREE_RELATIONSHIP_TO_EGO_VALUES.map(
            (value): [string, VariableValue, number] => [
              relationshipVariable,
              value,
              ceiling,
            ],
          ),
        );
      }
      const biologicalSexVariable = stage.nodeConfig?.biologicalSexVariable;
      if (biologicalSexVariable !== undefined) {
        fixed.push(
          ...BIOLOGICAL_SEX_VALUES.map(
            (value): [string, VariableValue, number] => [
              biologicalSexVariable,
              [value],
              ceiling,
            ],
          ),
        );
      }
      const diseaseVariables = new Set(
        (stage.nominationPrompts ?? []).map((prompt) => prompt.variable),
      );
      for (const candidate of stages) {
        if (
          candidate.type !== 'NarrativePedigree' ||
          candidate.sourceStageId !== stage.id
        ) {
          continue;
        }
        for (const disease of candidate.diseases) {
          diseaseVariables.add(disease.variable);
        }
      }
      for (const variable of diseaseVariables) {
        fixed.push([variable, true, ceiling], [variable, false, ceiling]);
      }
      recordPinned(node, nodeType, stageIndex, fixed);
    }

    const edgeType = stage.edgeConfig?.type;
    if (edgeType === undefined) continue;
    const edges =
      pedigreeEdgeCeiling(config, pedigreeContext) +
      inheritedContributorCeiling.edges;
    const redrawnAt = regenerated.get(edgeType);
    recordPinned(
      edge,
      edgeType,
      stageIndex,
      pedigreePossibleEdgeValues(stage.edgeConfig)
        .filter(
          ([variableId]) => (redrawnAt?.get(variableId) ?? -1) <= stageIndex,
        )
        .map(([variableId, value]) => [variableId, value, edges] as const),
    );
  }

  return { node, edge };
}

/**
 * Whether a collected reference belongs to a stage `generateNetwork` runs no
 * handler for — the one kind of naming that is no evidence of a value at all.
 *
 * A content stage names its types through the same schema tags a creating stage
 * does, but the dispatch does nothing for it: `CONTENT_STAGE_TYPES` is that
 * dispatch's own list, so a stage type this passes over is one the generator
 * provably neither creates an entity of nor writes an attribute onto. Anything
 * this cannot place on such a stage is read as a writer's — a path rooted
 * outside the stage list, an index naming no stage, and above all a stage type
 * neither the dispatch nor this list knows — because reading a writer as a
 * content stage would drop a scope whose values really are drawn, which is the
 * failure that emits an invalid value rather than merely refusing a good
 * protocol.
 *
 * The stage is read off the hit's own value path, whose root is the `stages`
 * array the caller passes in, exactly as `isBinPromptAssignment` reads it.
 */
function referencedByContentStage(
  path: readonly (string | number)[],
  stages: Stage[],
): boolean {
  const [root, stageIndex] = path;
  if (root !== 'stages' || typeof stageIndex !== 'number') return false;
  const stage = stages[stageIndex];
  return stage !== undefined && isContentStage(stage);
}

/**
 * Whether a collected reference belongs to a stage that writes only onto
 * entities some other stage created — the second kind of naming that is no
 * evidence of an entity.
 *
 * `handleAlterForm` and `handleAlterEdgeForm` create nothing: each reads the
 * existing population through `getStageFilteredNodes`/`getStageFilteredEdges`
 * and fills the variables its form renders on what it finds. Over a type
 * nothing creates, that population is empty, both loops run zero times, and no
 * value is drawn.
 *
 * The interview does the same, which is what makes this a statement about
 * validation rather than only about the draw. Both interfaces short-circuit on
 * an empty item list — `AlterForm.tsx` and `AlterEdgeForm.tsx` each compute
 * `mode === 'form' && items.length === 0`, call `moveForward()` from an effect
 * and `return null` — so no `SlidesForm` mounts, no `Field` renders, and
 * nothing is submitted. A rule is a form-field mechanism, so a rule declared on
 * such a type is never applied, and analysing it refuses a protocol over a
 * variable the run never reaches.
 *
 * Asked of the stage rather than of the reference site, as
 * {@link referencedByContentStage} is, and for the same reason: the answer is a
 * property of the handler, not of the tag. It is deliberately narrower than
 * "every stage that creates nothing" — a display-only reference site on a
 * writing stage still counts, and so does a bin's or a census' subject, because
 * distinguishing those would collapse the two readers `carriesNothing` weighs
 * against each other. What makes these two safe to drop is that a creating
 * stage names its own type through the same tags, so a type whose every naming
 * comes from a form is one no stage in the protocol creates at all — leaving
 * the counter with nothing it could have failed to model.
 */
function referencedByPopulationForm(
  path: readonly (string | number)[],
  stages: Stage[],
): boolean {
  const [root, stageIndex] = path;
  if (root !== 'stages' || typeof stageIndex !== 'number') return false;
  const stage = stages[stageIndex];
  return stage?.type === 'AlterForm' || stage?.type === 'AlterEdgeForm';
}

/**
 * The scopes a protocol's stages name in a way that could put a value on an
 * entity: the codebook node and edge types — as a subject, as a prompt's
 * created edge, as a FamilyPedigree's node or edge config, or as a filter
 * rule's target — and whether any stage takes ego as its subject.
 *
 * Read from the schema's own reference tags rather than from a hand-listed set
 * of stage keys, as `collectBinOnlyVariables` reads the attribute tags: a stage
 * type added to the schema later names its types through the same tags, so it
 * counts as a use — and keeps its scope analysed — without anything here being
 * updated. Ego has no type id to tag, so it is read from the attribute half of
 * the same walk: a form field's `variable` resolves against its stage's
 * subject, and that subject is ego exactly for the stages the schema gives an
 * ego subject. A filter rule's `attribute` resolves against the rule rather
 * than the stage and so names no scope here, which is right — an `ego` rule
 * reads a value, it does not write one.
 *
 * The tags describe the protocol, though, and not what the generator does with
 * it, so a stage that only DISPLAYS a type names it just as loudly as one that
 * creates it. What the tags cannot see, two predicates ask of the handlers.
 * {@link referencedByContentStage} drops a type only a Narrative puts on a
 * canvas, which has no entity to hold a value because `generateNetwork` runs
 * nothing for that stage. {@link referencedByPopulationForm} drops a type only
 * an alter form names, which has none either: the form writes onto a population
 * it did not create, and over a type nothing creates that population is empty.
 * Both are asked of the stage rather than of the reference site, because the
 * handler is where the answer actually lives — a Sociogram prompt's
 * `edges.display` names an edge type its stage will not create either, and that
 * finer reading belongs to the counter, which already draws it from
 * `edges.create` alone.
 */
function collectReferencedScopes(stages: Stage[]): {
  ego: boolean;
  node: ReadonlySet<string>;
  edge: ReadonlySet<string>;
} {
  const node = new Set<string>();
  const edge = new Set<string>();

  for (const hit of collectEntityTypeReferences({ stages })) {
    if (referencedByContentStage(hit.path, stages)) continue;
    if (referencedByPopulationForm(hit.path, stages)) continue;
    (hit.entity === 'edge' ? edge : node).add(hit.typeId);
  }

  const ego = collectEntityAttributeReferences({ stages }).some(
    (hit) => hit.subject?.entity === 'ego',
  );

  return { ego, node, edge };
}

/**
 * Whether `generateNetwork` runs a handler that writes ego's attributes for any
 * of these stages — the ego counterpart of `worstCaseEntityCounts`' own reading
 * of the stage list, and the second of the two readers the ego scope needs.
 *
 * `handleEgoForm` is the only writer of `egoAttributes`, and it draws the
 * codebook's whole ego attribute set rather than the fields its form declares.
 * So this asks after the stage and not after the variables it names: an
 * EgoForm still mid-edit, with no field added yet, draws every ego variable all
 * the same.
 */
function stagesWriteEgo(stages: Stage[]): boolean {
  return stages.some((stage) => stage.type === 'EgoForm');
}

/**
 * One entity type's variables, gathered into the equality groups `analyseEntity`
 * holds to a single value — the unit `unwrittenEdgeVariables` asks its question
 * in.
 *
 * Built from the declared rules rather than from the exempted ones, because
 * this is what decides the exemption. A variable's own `sameAs` is what puts it
 * in a group, so resolving groups from constraints an exemption had already
 * stripped would dissolve the group first and then ask about its members one at
 * a time — which is how the member carrying a group's `unique` rule comes to
 * look unwritten while the sibling a form renders writes the value it shares.
 *
 * `resolveGenerationOrder` is the same grouping `analyseEntity` performs, over
 * the same variables, so no second notion of a group enters. It runs there
 * again on the exempted constraints, where the groups can only be these or
 * finer: a group with any written member is exempted in full or not at all, so
 * the only ones an exemption can dissolve are groups nothing remains to analyse
 * in.
 */
function equalityGroupsOf(
  variables: Variables | undefined,
  today: string,
): string[][] {
  const { membersOf } = resolveGenerationOrder(
    buildEntityConstraints(variables, today),
  );
  return [...membersOf.values()];
}

/**
 * Groups joined by comparators, as the sets that have to be satisfiable
 * together. Reporting per component rather than per variable describes a chain
 * once, instead of naming each link of it as its own conflict.
 */
function comparatorComponents(edges: readonly ComparatorEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();

  const link = (from: string, to: string): void => {
    const neighbours = adjacency.get(from) ?? new Set<string>();
    neighbours.add(to);
    adjacency.set(from, neighbours);
  };

  for (const edge of edges) {
    link(edge.lower, edge.upper);
    link(edge.upper, edge.lower);
  }

  const seen = new Set<string>();
  const components: string[][] = [];

  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    seen.add(start);

    const component: string[] = [];
    const pending = [start];
    while (pending.length > 0) {
      const group = pending.pop();
      if (group === undefined) break;
      component.push(group);
      for (const next of adjacency.get(group) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }

    components.push(component);
  }

  return components;
}

type DelegatedConflict = {
  variableIds: string[];
  rules: string[];
  reason: string;
};

/**
 * Preserves generation's researcher-facing diagnostics while the validation
 * package owns the decision that a contradiction exists.
 */
function adaptDelegatedContradiction(
  contradiction: ValidationContradiction,
  entity: EntityConstraints,
  groups: ReadonlyMap<string, ConstrainedVariable>,
  groupOf: ReadonlyMap<string, string>,
  membersOf: ReadonlyMap<string, string[]>,
): DelegatedConflict {
  const participants = new Set(contradiction.variableIds);
  const variableIds = [...entity.keys()].filter((id) => participants.has(id));
  const strippedRules = [
    ...new Set(contradiction.strips.map(({ rule }) => rule)),
  ];

  if (contradiction.class === 'invertedBounds') {
    const variable = entity.get(variableIds[0] ?? '');
    const [minimum, maximum] = contradiction.strips;
    if (maximum === undefined) {
      if (
        minimum?.rule === 'maxSelected' &&
        variable?.constraints.required &&
        variable.constraints.maxSelected === 0
      ) {
        return {
          variableIds,
          rules: ['required', 'maxSelected'],
          reason:
            'maxSelected 0 permits only an empty selection, which required rejects',
        };
      }
      if (
        minimum?.rule === 'maxLength' &&
        variable?.constraints.required &&
        variable.constraints.maxLength === 0
      ) {
        return {
          variableIds,
          rules: ['required', 'maxLength'],
          reason:
            'maxLength 0 permits only an empty string, which required rejects',
        };
      }
      return {
        variableIds,
        rules: strippedRules,
        reason: contradiction.message,
      };
    }
    const valueOf = (rule: string): number | undefined => {
      if (rule === 'minLength' || rule === 'maxLength') {
        return variable?.constraints[rule];
      }
      if (rule === 'minValue' || rule === 'maxValue') {
        return variable?.constraints[rule];
      }
      if (rule === 'minSelected' || rule === 'maxSelected') {
        return variable?.constraints[rule];
      }
      return undefined;
    };
    const minimumValue = valueOf(minimum.rule);
    const maximumValue = valueOf(maximum.rule);
    if (minimumValue !== undefined && maximumValue !== undefined) {
      return {
        variableIds,
        rules: strippedRules,
        reason: `${minimum.rule} ${minimumValue} exceeds ${maximum.rule} ${maximumValue}`,
      };
    }
  }

  if (contradiction.class === 'minSelectedExceedsOptions') {
    const variable = entity.get(variableIds[0] ?? '');
    const minimum = variable?.constraints.minSelected;
    const optionCount =
      variable === undefined
        ? undefined
        : distinctOptionValues(variable.entry).length;
    if (minimum !== undefined && optionCount !== undefined) {
      return {
        variableIds,
        rules: strippedRules,
        reason: `minSelected ${minimum} exceeds the ${optionCount} available options`,
      };
    }
  }

  if (contradiction.class === 'conflictingReferencePair') {
    return {
      variableIds,
      rules: ['sameAs', 'differentFrom'],
      reason: 'these variables are required to be both equal and different',
    };
  }

  if (contradiction.class === 'strictComparatorCycle') {
    return {
      variableIds,
      rules: REFERENCE_RULES.filter((rule) =>
        variableIds.some(
          (id) => entity.get(id)?.constraints[rule] !== undefined,
        ),
      ),
      reason:
        'these variables reference each other in a cycle that no assignment can satisfy',
    };
  }

  const representatives = new Set(
    variableIds.map((id) => groupOf.get(id) ?? id),
  );
  if (variableIds.length > 1 && representatives.size === 1) {
    const [representative] = representatives;
    const memberIds = membersOf.get(representative ?? '') ?? variableIds;
    if (memberIds.length > 1) {
      const intersected = groups.get(representative ?? '');
      const members = memberIds.flatMap((id) => {
        const member = entity.get(id);
        return member === undefined ? [] : [member];
      });

      if (intersected !== undefined) {
        const crossings = emptyGroupBounds(members, intersected.constraints);
        if (crossings.length > 0) {
          const held = MERGING_RULES.filter((rule) =>
            memberIds.some((id) => {
              const target = entity.get(id)?.constraints[rule];
              return target !== undefined && memberIds.includes(target);
            }),
          );
          return {
            variableIds,
            rules: [
              ...held,
              ...crossings.flatMap((crossing) => crossing.rules),
            ],
            reason:
              'these variables are held to a single value, but their bounds do not ' +
              `overlap: ${crossings.map((crossing) => crossing.detail).join('; ')}`,
          };
        }
      }

      const offerings = variableIds.map((id) => {
        const member = entity.get(id);
        return {
          name: member?.entry.name ?? id,
          values:
            member === undefined ? [] : distinctOptionValues(member.entry),
        };
      });
      if (
        offerings.length > 1 &&
        offerings.every(({ values }) => values.length > 0)
      ) {
        const shared = offerings.reduce<Set<string | number | boolean>>(
          (intersection, { values }) =>
            new Set(values.filter((value) => intersection.has(value))),
          new Set(offerings[0]?.values ?? []),
        );
        if (shared.size === 0) {
          return {
            variableIds,
            rules: ['sameAs'],
            reason: `the options offered by ${offerings
              .map(
                ({ name, values }) =>
                  `"${name}" (${values.map(String).join(', ')})`,
              )
              .join(' and by ')} have no value in common`,
          };
        }
      }
    }
  }

  if (contradiction.class === 'disjointBounds') {
    return {
      variableIds,
      rules: REFERENCE_RULES.filter((rule) =>
        variableIds.some(
          (id) => entity.get(id)?.constraints[rule] !== undefined,
        ),
      ),
      reason:
        'the comparisons between these variables do not fit inside the bounds they declare',
    };
  }

  const solvedRules = solvedComponentRules(entity, variableIds);
  return {
    variableIds,
    rules: [...new Set([...solvedRules, ...strippedRules])],
    reason:
      contradiction.class === 'sameAsGroupConflict'
        ? contradiction.message
        : 'no combination of values these rules allow can satisfy all of them at once',
  };
}

function analyseEntity(
  scope: EntityScope,
  config: FeasibilityConfig,
): ConstraintConflict[] {
  const entity = buildEntityConstraints(
    scope.variables,
    config.today,
    scope.unvalidated,
  );
  const conflicts: ConstraintConflict[] = [];

  const { order, membersOf, groupOf, cycles } = resolveGenerationOrder(entity);
  const groups = intersectGroupConstraints(entity, membersOf);
  const uniqueReported = new Set<string>();
  const fixedReported = new Set<string>();
  // Groups an earlier check has already refused. The complete search below
  // skips components touching them: re-proving a contradiction that already
  // has a targeted message would only report it twice, less usefully.
  const implicated = new Set<string>();

  // Folded onto groups because a `unique` value is claimed once for the whole
  // group its members share: two prompts fixing one value on two variables held
  // equal spend the same value twice, exactly as one prompt fixing it twice.
  const fixedByGroup = new Map<string, Map<string, FixedCarriers>>();
  const fixedDisplay = new Map<string, string>();
  const foldFixedValues = (
    values: PromptFixedValues,
    origin: FixedValueOrigin,
  ): void => {
    for (const [id, tallies] of values) {
      if (!entity.has(id)) continue;
      const group = groupOf.get(id) ?? id;
      const carriers =
        fixedByGroup.get(group) ?? new Map<string, FixedCarriers>();
      for (const [key, { value, count, stampedAt }] of tallies) {
        const carrier = carriers.get(key) ?? {
          count: 0,
          origins: new Set<FixedValueOrigin>(),
        };
        carrier.count += count;
        carrier.origins.add(origin);
        if (stampedAt !== undefined) {
          carrier.stampedAt = Math.max(
            carrier.stampedAt ?? stampedAt,
            stampedAt,
          );
        }
        carriers.set(key, carrier);
        fixedDisplay.set(key, String(value));
      }
      fixedByGroup.set(group, carriers);
    }
  };
  foldFixedValues(scope.fixedValues, 'prompt');
  foldFixedValues(scope.pedigreeFixedValues, 'pedigree');

  // Roster rows join a value the protocol already fixes, rather than starting a
  // tally of their own: rows repeating a value between them are the pass-over's
  // business and spend it once, which `worstCaseCountFor` already counts. What
  // no pass-over reaches is a row holding a value some stage will write onto a
  // node of its own regardless — and only where the row can be drawn first.
  // Once the stage has written it the value is claimed, and every row carrying
  // it from there on is passed over, which is what the stage indices settle.
  //
  // Counted once per value however many members of the group carry it and
  // however many rows do: the members share a single `unique` slot, so one row
  // holding the value on two of them is one node holding it, and the second row
  // to offer it is passed over.
  for (const [id, carried] of scope.rosterCarriedValues) {
    if (!entity.has(id)) continue;
    const carriers = fixedByGroup.get(groupOf.get(id) ?? id);
    if (carriers === undefined) continue;

    for (const [key, offeredAt] of carried) {
      const carrier = carriers.get(key);
      if (carrier?.stampedAt === undefined) continue;
      if (offeredAt > carrier.stampedAt) continue;
      if (carrier.origins.has('roster')) continue;
      carrier.count += 1;
      carrier.origins.add('roster');
    }
  }

  /** Every declared variable belonging to one of these groups, in codebook order. */
  const idsInGroups = (representatives: readonly string[]): string[] => {
    const members = new Set(representatives);
    return [...entity.keys()].filter((id) =>
      members.has(groupOf.get(id) ?? id),
    );
  };

  const report = (
    variableIds: string[],
    rules: string[],
    reason: string,
  ): void => {
    for (const id of variableIds) implicated.add(groupOf.get(id) ?? id);
    conflicts.push({
      entity: scope.entity,
      ...(scope.entityType !== undefined
        ? { entityType: scope.entityType }
        : {}),
      ...(scope.entityTypeName !== undefined
        ? { entityTypeName: scope.entityTypeName }
        : {}),
      variableIds,
      variableNames: namesOf(entity, variableIds),
      rules,
      reason,
    });
  };

  for (const contradiction of delegatedValidationContradictions(
    scope.variables,
    scope.unvalidated,
  )) {
    const delegated = adaptDelegatedContradiction(
      contradiction,
      entity,
      groups,
      groupOf,
      membersOf,
    );
    report(delegated.variableIds, delegated.rules, delegated.reason);
  }

  // A value a prompt fixes is settled before anything is drawn: the protocol
  // states it, so what the finished node holds is what the protocol wrote.
  // Nothing a seed does can rescue a value the variable's own rules reject, or
  // a pair a rule between them cannot hold, which is what makes these refusals
  // here rather than draws that fail on some seeds and not others.
  const brokenReported = new Set<string>();
  for (const assignment of scope.fixedAssignments) {
    const broken = ruleBrokenByFixedValues(entity, assignment);
    if (broken === undefined) continue;

    const key = `${broken.rule}:${broken.variableIds.join(',')}`;
    if (brokenReported.has(key)) continue;
    brokenReported.add(key);

    const fixedTo = broken.values.map((value) => String(value)).join(' and ');
    report(
      broken.variableIds,
      [broken.rule, 'additionalAttributes'],
      broken.variableIds.length === 1
        ? `a prompt fixes this variable to ${fixedTo}, which ${broken.rule} does not allow`
        : `a prompt fixes these variables to ${fixedTo}, which ${broken.rule} cannot hold`,
    );
  }

  for (const [id, variable] of entity) {
    const { constraints } = variable;

    // The schema bounds neither length rule, so an imported protocol can ask
    // for a value no run can build: a floor of a billion characters reaches
    // `padEnd` and throws, and floors well short of that allocate hundreds of
    // megabytes into the tab running the preview.
    //
    // Refused here rather than clamped at the draw. Clamping would emit a value
    // shorter than its own `minLength` — data the interview's own validator
    // rejects, which is the defect class this pass exists to remove — so the
    // protocol is turned away before a seed is consulted instead. A `maxLength`
    // above the cap needs no refusal: `textDrawLength` draws shorter, which
    // satisfies it, and the value space is counted at that same length.
    if (
      constraints.minLength !== undefined &&
      constraints.minLength > MAX_TEXT_DRAW_LENGTH
    ) {
      report(
        [id],
        ['minLength'],
        `minLength ${constraints.minLength} exceeds the ${MAX_TEXT_DRAW_LENGTH} characters a generated value can hold`,
      );
    }

    // Schema R1 prevents this in validated protocols; hand-built codebooks still need the guard.
    // A ceiling below zero needs no `required` to contradict: no string's
    // length can be at or under it, so the runtime's maxLength validator
    // rejects every string it is handed — `""` included, with "Too long. Enter
    // fewer than -1 characters." That is what separates it from `maxLength: 0`,
    // where the empty string is a value the rule genuinely permits. A negative
    // `minLength` is the mirror image and deliberately left alone: no string is
    // shorter than a negative floor, so that rule is vacuous, not broken.
    if (constraints.maxLength !== undefined && constraints.maxLength < 0) {
      report(
        [id],
        ['maxLength'],
        `maxLength ${constraints.maxLength} permits no string at all`,
      );
    }

    // Schema R1 prevents this in validated protocols; hand-built codebooks still need the guard.
    // The selection sibling, on the same reasoning: a negative `maxSelected`
    // rejects every array including the empty one, while a negative
    // `minSelected` is vacuous. Value bounds are not checked this way —
    // `minValue` and `maxValue` bound a number, which has no floor at zero.
    if (constraints.maxSelected !== undefined && constraints.maxSelected < 0) {
      report(
        [id],
        ['maxSelected'],
        `maxSelected ${constraints.maxSelected} permits no selection at all`,
      );
    }

    const window = constraints.dateWindow;
    if (
      window?.min !== undefined &&
      window.max !== undefined &&
      window.min > window.max
    ) {
      report(
        [id],
        ['parameters'],
        `the date range ${window.min} to ${window.max} is empty`,
      );
    }

    // A variable naming the same target for both `sameAs` and `differentFrom`
    // forces that pair into one equality group whose `differentFrom` then
    // points at itself; `resolveGenerationOrder`'s cycle detection (below)
    // already reports that self-loop, so no separate check is needed here.

    if (constraints.unique) {
      if (scope.entity === 'ego') {
        report([id], ['unique'], 'unique is not supported on ego variables');
      } else {
        // Measured against the group's intersected rules, because that is what
        // the generator draws against: a variable held equal to a narrower one
        // reaches only the narrower value space, however wide its own is.
        const group = groupOf.get(id) ?? id;
        const members = membersOf.get(group) ?? [id];
        // Counted over the group rather than over its members one at a time.
        // Every entity carrying any member of the group spends the group's
        // value — a variable a form fills on nine edges spends nine, however
        // few carry the member held equal to it — but the members' counts also
        // constrain each other, because they share one `unique` slot: three
        // roster rows all carrying `a` build one node between them whatever
        // the count of a `b` they leave unset says.
        const holders = scope.worstCaseCountFor(members);
        const size = valueSpaceSize(groups.get(group) ?? variable, holders);

        if (
          size !== 'unbounded' &&
          size < holders &&
          !certainlyMissing(members, scope) &&
          !uniqueReported.has(group)
        ) {
          uniqueReported.add(group);
          report(
            members,
            ['unique'],
            `only ${size} distinct values are possible${members.length > 1 ? ' once these variables are held equal' : ''}, but up to ${holders} ${scope.entity}s of this type can be generated`,
          );
        }

        // A value a prompt fixes is written onto every node the prompt creates
        // rather than drawn, so no seed can spread it over more than one
        // holder: a prompt that fixes a `unique` value and can create two
        // people is asking for a value two of them hold, which no assignment
        // satisfies. Refused here rather than at the draw, so the protocol
        // fails the same way on every seed instead of on the ones whose node
        // count happened to reach two.
        //
        // A FamilyPedigree stage's ego flag is the same thing written by a
        // stage: the interface marks its proband `true` and every other node it
        // builds `false`, so a pedigree of three pins one value twice, and two
        // pedigrees pin `true` once each. No draw stands between those pins and
        // the finished network, which is why this is a refusal rather than
        // something the unique registry could settle.
        //
        // A roster row carrying the same value is the third writer, and the one
        // whose collision the draw looks like it settles and does not: the row
        // is passed over, and the value the protocol fixes is then written onto
        // the node fabricated in its place. Counted here rather than left to
        // `rosterRowIsDrawable`, which decides which node carries a fixed value
        // and never whether the protocol left room for it at all.
        const spent = [...(fixedByGroup.get(group) ?? [])].filter(
          ([, carrier]) => carrier.count > 1,
        );
        if (spent.length > 0 && !fixedReported.has(group)) {
          fixedReported.add(group);
          const detail = spent
            .map(
              ([key, { count }]) =>
                `${fixedDisplay.get(key) ?? key} on up to ${count} ${scope.entity}s`,
            )
            .join(' and to ');
          const origins = new Set(
            spent.flatMap(([, carrier]) => [...carrier.origins]),
          );
          const { writers, verb } = fixedBy(origins);
          report(
            members,
            [
              // Only the protocol's own writers name a rule: a roster row is
              // data the run is handed, and the schema has no key for it. A
              // pedigree writes node pins through its egoVariable and edge
              // pins through its edgeConfig, so the label follows the scope.
              'unique',
              ...(origins.has('prompt') ? ['additionalAttributes'] : []),
              ...(origins.has('pedigree')
                ? [scope.entity === 'edge' ? 'edgeConfig' : 'egoVariable']
                : []),
            ],
            `${writers} ${verb} ${members.length > 1 ? 'these variables, which are held equal,' : 'this'} to ${detail}, but unique allows one ${scope.entity} to hold a value`,
          );
        }
      }
    }
  }

  // Comparators only contradict each other as a system: `a < b < c` on `[0, 1]`
  // has three pairs that each fit and no assignment that does. Propagation
  // settles the whole system, and a group left with an empty range is a chain
  // the declared bounds cannot hold. It reports only the groups its own walks
  // emptied — a group whose range had already crossed over is one of the two
  // checks above, a single variable's bounds or a group's members' against each
  // other, and neither needs a comparator to be wrong.
  const edges = groupComparatorEdges(entity, groupOf);
  const {
    groups: propagated,
    inverted,
    incomparable,
  } = propagateComparatorBounds(groups, order, edges);
  const cyclicGroups = new Set(
    cycles.flat().map((id) => groupOf.get(id) ?? id),
  );

  for (const component of comparatorComponents(edges)) {
    if (!component.some((group) => inverted.has(group))) continue;
    if (component.some((group) => implicated.has(group))) continue;
    // A cycle is reported below with the reason that describes it; its members'
    // bounds crossing over is that same contradiction counted twice.
    if (component.some((group) => cyclicGroups.has(group))) continue;

    const ids = idsInGroups(component);
    const rules = COMPARISON_RULES.filter((rule) =>
      ids.some((id) => {
        const target = entity.get(id)?.constraints[rule];
        return target !== undefined && entity.has(target);
      }),
    );

    // A comparison whose ends are a number and a date has no satisfying pair of
    // values at bounds of any width, so naming the bounds would send its author
    // to widen a range that was never the problem.
    report(
      ids,
      rules,
      component.some((group) => incomparable.has(group))
        ? 'a number is compared against a date here, which no assignment can satisfy'
        : 'the comparisons between these variables do not fit inside the bounds they declare',
    );
  }

  for (const cycle of cycles) {
    if (cycle.some((id) => implicated.has(groupOf.get(id) ?? id))) continue;
    const rules = REFERENCE_RULES.filter((rule) =>
      cycle.some((id) => entity.get(id)?.constraints[rule] !== undefined),
    );
    // Without a comparator the group is held together by `sameAs` alone, so the
    // contradiction is a `differentFrom` inside it rather than a chain of
    // mutual references.
    const involvesComparator = COMPARISON_RULES.some((rule) =>
      rules.includes(rule),
    );

    report(
      cycle,
      rules,
      involvesComparator
        ? 'these variables reference each other in a cycle that no assignment can satisfy'
        : 'these variables are required to be both equal and different',
    );
  }

  // Interval reasoning cannot represent "this range minus the value another
  // variable took", so shapes like a differentFrom pinned to a single shared
  // value slip through every check above and used to surface as seed-dependent
  // draw failures. Where a component's domains are small enough to enumerate,
  // a complete search settles it: exhausting the space without a solution is a
  // proof of unsatisfiability, and anything short of that proof — including a
  // search that ran out of budget — never refuses.
  const components = solvableComponents(
    propagated,
    order,
    edges,
    differentFromGroups(entity, groupOf),
  );
  for (const component of components) {
    if (component.tractable === undefined) continue;
    if (component.groups.some((group) => implicated.has(group))) continue;
    if (solveComponent(component.tractable).kind !== 'unsat') continue;

    const ids = idsInGroups(component.groups);
    report(
      ids,
      solvedComponentRules(entity, ids),
      'no combination of values these rules allow can satisfy all of them at once',
    );
  }

  // The same search, run again around the values a prompt states.
  //
  // A prompt's `additionalAttributes` settle their own variables and nothing
  // else: the draw is asked only for the variables they leave over, and a rule
  // spanning a fixed value and one of those is met by whichever value that draw
  // produces — or by none of them. `applyComparatorBounds` keeps the draw inside
  // its own bounds when a fixed value pushes it past them, so what the stage
  // emits is an entity holding a pair the rule rejects rather than a draw that
  // fails.
  //
  // Refused here rather than passed over, which is where this parts company with
  // the identical check a roster row gets. A row is one candidate among many, so
  // the draw moves on to the next one; a prompt's values are stated by the
  // protocol, every entity the stage creates carries them, and there is no next
  // candidate for any seed to reach.
  //
  // Judged by the same `solveComponent` the loop above and the roster check
  // call, over the same components, pinned the way `completionCheckFor` pins
  // them — so the three cannot come to different conclusions about one set of
  // rules. Only a proven `unsat` refuses: an oversized component, an
  // unenumerable domain and an exhausted budget all leave the search with
  // nothing to say, and the fold below is what then speaks for the draw.
  for (const assignment of scope.fixedAssignments) {
    const pins = new Map<string, VariableValue>();
    for (const [id, value] of Object.entries(assignment)) {
      if (!entity.has(id)) continue;
      // A null binds no comparator and collides with no drawn value, so it
      // settles nothing here either — the reading the draw gives a null
      // counterpart.
      if (value === null || value === undefined) continue;
      pins.set(groupOf.get(id) ?? id, value);
    }
    if (pins.size === 0) continue;

    /**
     * What this assignment states about the variables of these groups, named
     * from the codebook entry rather than keyed by it: an Architect-authored
     * protocol keys its variables by UUID, and a message built from those keys
     * names nothing its author would recognise.
     */
    const statedIn = (groupIds: readonly string[]): string[] => {
      const inComponent = new Set(groupIds);
      const stated: string[] = [];
      for (const [id, variable] of entity) {
        const value = assignment[id];
        if (value === null || value === undefined) continue;
        if (!inComponent.has(groupOf.get(id) ?? id)) continue;
        stated.push(`"${variable.entry.name}" to ${String(value)}`);
      }
      return stated;
    };

    // Groups a `sat` proof has already answered for. A completion the search
    // found is one the fold below cannot contradict — some value satisfies
    // every comparison there, so no fold of theirs is empty — and skipping them
    // keeps the second pass off the path the first one settled.
    const settled = new Set<string>();

    for (const component of components) {
      const { tractable } = component;
      if (tractable === undefined) continue;
      if (component.groups.some((group) => implicated.has(group))) continue;
      if (!component.groups.some((group) => pins.has(group))) continue;
      // A component the fixed values settle entirely leaves nothing to complete.
      // Whether those values may stand together is what `ruleBrokenByFixedValues`
      // above already answered, and answering it twice could only disagree.
      if (component.groups.every((group) => pins.has(group))) continue;

      const verdict = solveComponent(tractable, { pins });
      if (verdict.kind === 'sat') {
        for (const group of component.groups) settled.add(group);
        continue;
      }
      if (verdict.kind !== 'unsat') continue;

      const ids = idsInGroups(component.groups);
      const stated = statedIn(component.groups);

      report(
        ids,
        [...solvedComponentRules(entity, ids), 'additionalAttributes'],
        `a prompt fixes ${stated.join(' and ')}, and no combination of values these rules allow can complete the rest around ${stated.length > 1 ? 'them' : 'it'}`,
      );
    }

    // What the draw does where the search declined to answer.
    //
    // A component with an unenumerable domain — a number left without a bound
    // on one side is enough — is never handed to the search, so the loop above
    // passes over it and hands the assignment to the greedy path unexamined.
    // That path is not undecided about it: it folds each remaining group's
    // comparators against the fixed values, and where the fold leaves the range
    // empty it clamps back inside the group's own bounds and draws there. So
    // the value it emits is settled, and it is one the folded comparison has
    // already been pushed past.
    //
    // Asked of `comparatorFoldEmptied` — the draw's own arithmetic, shared with
    // the roster check rather than restated here — and asked only of groups no
    // `sat` proof settled, so the two passes cannot disagree. An empty fold is
    // not a second opinion about satisfiability: `tighten` only raises floors
    // and lowers ceilings, so a floor above the ceiling at that point is an
    // exact statement that every value the draw can still produce for the group
    // breaks one of the comparisons folded in. A comparator whose counterpart
    // this prompt leaves unfixed contributes no bound, a fold left open on one
    // side cannot be empty, and a group with no comparators is never read — all
    // three keep accepting, which is what stops this refusing a protocol that
    // generates.
    for (const component of comparatorComponents(edges)) {
      if (component.some((group) => implicated.has(group))) continue;
      if (!component.some((group) => pins.has(group))) continue;

      const emptied = component.filter((group) => {
        if (pins.has(group) || settled.has(group)) return false;
        const variable = propagated.get(group);
        if (variable === undefined) return false;
        return comparatorFoldEmptied(
          variable,
          group,
          { edges, membersOf },
          assignment,
        );
      });
      if (emptied.length === 0) continue;

      const ids = idsInGroups(component);
      const stated = statedIn(component);
      const drawn = namesOf(entity, idsInGroups(emptied)).map(
        (name) => `"${name}"`,
      );

      report(
        ids,
        [...solvedComponentRules(entity, ids), 'additionalAttributes'],
        `a prompt fixes ${stated.join(' and ')}, and every value the draw can give ${drawn.join(' and ')} breaks a comparison against ${stated.length > 1 ? 'them' : 'it'}`,
      );
    }
  }

  return conflicts;
}

/**
 * The rules a solver refusal names: every reference rule the component's
 * members declare, plus the declared bounds that box the search in. A scalar's
 * implicit 0-1 scale is left out — naming a rule the protocol never wrote
 * points its author at nothing.
 */
function solvedComponentRules(
  entity: EntityConstraints,
  ids: readonly string[],
): string[] {
  const rules = new Set<string>(
    REFERENCE_RULES.filter((rule) =>
      ids.some((id) => entity.get(id)?.constraints[rule] !== undefined),
    ),
  );

  for (const id of ids) {
    const variable = entity.get(id);
    if (variable === undefined) continue;
    const { entry, constraints } = variable;

    if (entry.type !== 'scalar') {
      if (constraints.minValue !== undefined) rules.add('minValue');
      if (constraints.maxValue !== undefined) rules.add('maxValue');
    }
    if (constraints.minSelected !== undefined) rules.add('minSelected');
    if (constraints.maxSelected !== undefined) rules.add('maxSelected');
    const window = constraints.dateWindow;
    if (
      window !== undefined &&
      (window.min !== undefined || window.max !== undefined)
    ) {
      rules.add('parameters');
    }
  }

  return [...rules];
}

/**
 * `externalData` is the roster rows generation will draw from, keyed by stage
 * id. Omitting it reads every roster stage as fabricating people, which counts
 * more entities rather than fewer — see {@link worstCaseEntityCounts}.
 */
export function analyseFeasibility(
  codebook: StructuralCodebook,
  stages: Stage[],
  config: FeasibilityConfig,
  externalData?: Record<string, NcNode[]>,
  respectSkipLogicAndFiltering = false,
  familyPedigree?: ResolvedFamilyPedigreeGenerationOptions,
): ConstraintConflict[] {
  const binOnly = collectBinOnlyVariables(stages);
  // The map the draw judges a roster row against, so a row this pass counts is
  // one `createNodesForStage` would really build a node from — read both by the
  // entity counts and by the collision counter below, which ask the same
  // question of the same rows. Per type on demand: both readers ask only about
  // types a stage draws rows of, so a stale bound on an unused type keeps being
  // skipped rather than thrown on. `binOnly` is load-bearing — the draw builds
  // its constraints with it, and building without it would exclude rows the draw
  // really does use.
  const builtConstraints = new Map<string, EntityConstraints | undefined>();
  const nodeConstraints = (type: string): EntityConstraints | undefined => {
    if (builtConstraints.has(type)) return builtConstraints.get(type);

    const variables = codebook.node?.[type]?.variables;
    const built =
      variables === undefined
        ? undefined
        : buildEntityConstraints(variables, config.today, binOnly.get(type));
    builtConstraints.set(type, built);
    return built;
  };
  const counts = worstCaseEntityCounts(
    stages,
    config,
    externalData,
    nodeConstraints,
    familyPedigree,
    (type) => codebook.node?.[type]?.variables,
    respectSkipLogicAndFiltering,
  );
  const promptFixed = countPromptFixedValues(stages, config, externalData);
  const pedigreeFixed = countPedigreeFixedValues(
    stages,
    config,
    respectSkipLogicAndFiltering,
    counts.nodeBeforeStage,
    familyPedigree,
  );
  const rosterCarried = countRosterCarriedValues(
    stages,
    config,
    externalData,
    nodeConstraints,
  );
  const promptAssignments = collectPromptFixedAssignments(
    stages,
    config,
    externalData,
  );
  const referenced = collectReferencedScopes(stages);
  const scopes: EntityScope[] = [];

  // The network always carries an ego entity, but its attributes stay empty
  // until a stage writes them, and only an ego-subject stage does. A stage list
  // with none draws no ego value and submits none, so a rule declared on an ego
  // variable is never applied — and analysing ego then refuses a protocol over
  // a variable the run never reaches, exactly as an unused node type did.
  //
  // Read as a whole scope rather than variable by variable, for the reason the
  // node and edge scopes are: `handleEgoForm` draws the codebook's whole ego
  // attribute set rather than the fields its form declares, so an ego variable
  // no field names is drawn all the same wherever an EgoForm exists, and has no
  // exemption to claim.
  //
  // Both readers have to agree ego is absent, as for a node or edge type below.
  // The schema's tags see an ego subject through a form field's `variable`,
  // which resolves against its stage's subject; `generateNetwork`'s own
  // dispatch sees the stage whose handler writes ego. So neither a tag dropped
  // from the schema nor a field list still empty mid-edit can on its own delete
  // a refusal — which matters more here than it does for a node or edge type,
  // because dropping this scope wrongly does not make the draw fail. It makes
  // it emit a value the rule rejects.
  if (referenced.ego || stagesWriteEgo(stages)) {
    scopes.push({
      entity: 'ego',
      variables: codebook.ego?.variables,
      unvalidated: NO_UNVALIDATED_VARIABLES,
      worstCaseCountFor: () => 1,
      // No stage fixes a value on ego: `additionalAttributes` belongs to a
      // name-generator prompt, and a pedigree's ego flag to its own nodes, both
      // of whose subjects are always a node. A roster row is a node too — it is
      // drawn into the network as one — so it writes nothing here either.
      fixedValues: NO_FIXED_VALUES,
      pedigreeFixedValues: NO_FIXED_VALUES,
      rosterCarriedValues: NO_ROSTER_VALUES,
      fixedAssignments: NO_FIXED_ASSIGNMENTS,
    });
  }

  // A codebook type the stage list never names carries no entity: no stage
  // creates one, and nothing writes onto one. No value of its variables is ever
  // drawn or submitted, so a rule declared on them is never applied. For a type
  // that is created, the same reasoning applies per equality group: a shared
  // node type can carry variables collected by only one of several stages, and
  // rules on a variable no stage writes must not refuse an otherwise feasible
  // protocol. See `unwrittenNodeVariables`.
  //
  // Asked of the type rather than of the counts, because the zeroes reaching
  // this pass do not all mean the same thing. An edge type's per-variable count
  // is zero for every variable no form fills, while its edges exist all the
  // same, so reading that zero as "unused" would delete the whole type's
  // analysis on the strength of one unwritten variable.
  //
  // Both readers have to agree the type is absent. The schema's tags and
  // `worstCaseEntityCounts`' own field reads see the same stage list
  // independently, so neither a tag dropped from the schema nor a creating
  // stage the counter does not model can on its own delete a refusal.
  //
  // What the tag reader keeps at a count of zero is a type some stage names
  // while this counter models nothing creating one — a creating stage the
  // counter does not model, or one whose reading of a configured bound differs.
  // That fallback is why the counts alone do not decide this, and dropping a
  // scope wrongly is the expensive direction: it does not make the draw fail,
  // it makes it emit a value the rule rejects.
  //
  // It is only worth having for a naming that is evidence of an entity, though.
  // Two kinds are not, and both are dropped before they get here — see
  // `collectReferencedScopes`. A content stage runs no handler at all. An alter
  // form runs one that writes onto a population it did not create, so over a
  // type nothing creates it writes onto nobody, and the interview's own
  // interface advances past an empty item list without rendering a field.
  const carriesNothing = (
    entity: 'node' | 'edge',
    type: string,
    counted: boolean,
  ): boolean => !referenced[entity].has(type) && !counted;

  for (const [type, definition] of Object.entries(codebook.node ?? {})) {
    if (carriesNothing('node', type, counts.node.has(type))) continue;

    scopes.push({
      entity: 'node',
      entityType: type,
      ...(definition.name !== undefined
        ? { entityTypeName: definition.name }
        : {}),
      variables: definition.variables,
      unvalidated: new Set([
        ...(binOnly.get(type) ?? NO_UNVALIDATED_VARIABLES),
        ...unwrittenNodeVariables(
          counts.node,
          type,
          equalityGroupsOf(definition.variables, config.today),
        ),
      ]),
      // Count only nodes that can actually carry this equality group: those
      // whose creating stage writes it, plus earlier nodes reached by a later
      // stage writer. Roster values remain row-driven.
      worstCaseCountFor: (variableIds) =>
        nodeCountFor(counts.node, type, variableIds),
      fixedValues: promptFixed.get(type) ?? NO_FIXED_VALUES,
      pedigreeFixedValues: pedigreeFixed.node.get(type) ?? NO_FIXED_VALUES,
      rosterCarriedValues: rosterCarried.get(type) ?? NO_ROSTER_VALUES,
      fixedAssignments: promptAssignments.get(type) ?? NO_FIXED_ASSIGNMENTS,
    });
  }

  for (const [type, definition] of Object.entries(codebook.edge ?? {})) {
    const counted =
      counts.edge.base.has(type) || counts.edge.pedigree.has(type);
    if (carriesNothing('edge', type, counted)) continue;

    scopes.push({
      entity: 'edge',
      entityType: type,
      ...(definition.name !== undefined
        ? { entityTypeName: definition.name }
        : {}),
      variables: definition.variables,
      // Both binning stages take a node subject, so no edge variable is
      // bin-assigned. What an edge type does have is the other half of the same
      // question: where a FamilyPedigree is its only source, every edge starts
      // empty and only the variables a later stage writes ever stop being — so
      // the rest are exempt for the same reason a bin-assigned variable is,
      // that nothing in the run ever applies their rules. Per group rather than
      // per type, because a form filling one of them leaves its siblings
      // undefined on the very same edges.
      unvalidated: unwrittenEdgeVariables(
        counts.edge,
        type,
        equalityGroupsOf(definition.variables, config.today),
      ),
      worstCaseCountFor: (variableIds) =>
        edgeCountFor(counts.edge, type, variableIds),
      // No PROMPT writes a value onto an edge the draw did not choose:
      // `additionalAttributes` belongs to a name-generator prompt, whose subject
      // is always a node, and a census prompt's `edgeVariable` names an edge
      // variable but supplies no value for it — `handleDyadCensus` fills it
      // through `generateEntityAttributes` like any other drawn attribute.
      // Roster rows are nodes, and no stage draws an edge from one, so they
      // write nothing here either. A FamilyPedigree, though, writes its
      // relationship values onto every edge it builds — the one edge-side
      // writer the draw never chose, counted the same way its ego flag is.
      fixedValues: NO_FIXED_VALUES,
      pedigreeFixedValues: pedigreeFixed.edge.get(type) ?? NO_FIXED_VALUES,
      rosterCarriedValues: NO_ROSTER_VALUES,
      fixedAssignments: NO_FIXED_ASSIGNMENTS,
    });
  }

  return scopes.flatMap((scope) => analyseEntity(scope, config));
}
