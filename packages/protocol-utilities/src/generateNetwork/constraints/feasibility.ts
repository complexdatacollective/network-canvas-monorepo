import {
  collectEntityTypeReferences,
  type Stage,
  type StructuralCodebook,
  type Variables,
} from '@codaco/protocol-validation';
import type { NcNode, VariableValue } from '@codaco/shared-consts';

import type { ResolvedGenerationConfig } from '../config';
import {
  collectPromptFixedAssignments,
  countPromptFixedValues,
  type PromptFixedValues,
  ruleBrokenByFixedValues,
} from '../nodes';
import { collectBinOnlyVariables } from './binOnlyVariables';
import { buildEntityConstraints } from './buildConstraints';
import { type ComparatorEdge, resolveGenerationOrder } from './dependencyOrder';
import {
  edgeCountFor,
  nodeCountFor,
  pedigreeNodeCeiling,
  worstCaseEntityCounts,
} from './entityCounts';
import type { ConstraintConflict } from './error';
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
import { distinctOptionValues, valueSpaceSize } from './valueSpace';

type EntityScope = {
  entity: 'ego' | 'node' | 'edge';
  entityType?: string;
  entityTypeName?: string;
  variables: Variables | undefined;
  /** Variables of this type whose rules nothing in the interview applies. */
  unvalidated: ReadonlySet<string>;
  /**
   * How many distinct values of one variable entities of this type can spend
   * between them. Per variable rather than per type, because a pedigree edge
   * holds a value only for the variables some stage writes onto it, and roster
   * rows repeating one variable's value spend it once between them.
   */
  worstCaseCountFor: (variableId: string) => number;
  /** Values prompts write onto this type, and how many entities can hold each. */
  fixedValues: PromptFixedValues;
  /** The same, for the ego flag a FamilyPedigree stage pins on its own nodes. */
  pedigreeFixedValues: PromptFixedValues;
  /** Each prompt's whole set of values, as one entity ends up holding it. */
  fixedAssignments: readonly Record<string, VariableValue>[];
};

/** Which part of the protocol wrote a value the draw never got to choose. */
type FixedValueOrigin = 'prompt' | 'pedigree';

/** How many entities hold one fixed value, and what wrote it onto them. */
type FixedCarriers = { count: number; origins: Set<FixedValueOrigin> };

const NO_UNVALIDATED_VARIABLES: ReadonlySet<string> = new Set();
const NO_FIXED_VALUES: PromptFixedValues = new Map();
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
 * What to call whatever wrote a fixed value, so the message points at the part
 * of the protocol its author would edit.
 */
function fixedBy(origins: ReadonlySet<FixedValueOrigin>): string {
  if (origins.size > 1) return 'the protocol';
  return origins.has('pedigree') ? 'a family pedigree' : 'a prompt';
}

/**
 * The ego flag each FamilyPedigree stage pins, counted like a prompt's fixed
 * values so both reach the same refusal.
 *
 * The interface marks exactly one node of a pedigree as ego and every other
 * node it builds as not-ego, whatever the flag's declared type, so a stage of
 * `n` nodes pins `true` once and `false` `n - 1` times. Both are written rather
 * than drawn: `handleFamilyPedigree` assigns them after generating the rest of
 * the node, so no seed spreads them over more holders or fewer. Counted at the
 * configured ceiling, for the same reason the rest of feasibility counts worst
 * cases, and summed across stages because a `unique` value is claimed once for
 * the whole run.
 */
function countPedigreeFixedValues(
  stages: Stage[],
  config: ResolvedGenerationConfig,
): Map<string, PromptFixedValues> {
  const byType = new Map<string, PromptFixedValues>();

  for (const stage of stages) {
    if (stage.type !== 'FamilyPedigree') continue;

    const nodeType = stage.nodeConfig?.type;
    const egoVariable = stage.nodeConfig?.egoVariable;
    if (nodeType === undefined || egoVariable === undefined) continue;

    const ceiling = pedigreeNodeCeiling(config);
    const pinned: [boolean, number][] = [
      [true, Math.min(ceiling, 1)],
      [false, Math.max(ceiling - 1, 0)],
    ];

    const forType = byType.get(nodeType) ?? new Map();
    const forVariable = forType.get(egoVariable) ?? new Map();
    for (const [value, carriers] of pinned) {
      if (carriers === 0) continue;
      const key = valueKey(value);
      forVariable.set(key, {
        value,
        count: (forVariable.get(key)?.count ?? 0) + carriers,
      });
    }
    forType.set(egoVariable, forVariable);
    byType.set(nodeType, forType);
  }

  return byType;
}

/**
 * The codebook node and edge types a protocol's stages name at all — as a
 * subject, as a prompt's created edge, as a FamilyPedigree's node or edge
 * config, or as a filter rule's target.
 *
 * Read from the schema's own `entityTypeReference` tags rather than from a
 * hand-listed set of stage keys, as `collectBinOnlyVariables` reads the
 * attribute tags: a stage type added to the schema later names its types
 * through the same tags, so it counts as a use — and keeps its scope
 * analysed — without anything here being updated.
 */
function collectReferencedTypes(stages: Stage[]): {
  node: ReadonlySet<string>;
  edge: ReadonlySet<string>;
} {
  const node = new Set<string>();
  const edge = new Set<string>();

  for (const hit of collectEntityTypeReferences({ stages })) {
    (hit.entity === 'edge' ? edge : node).add(hit.typeId);
  }

  return { node, edge };
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

function analyseEntity(
  scope: EntityScope,
  config: ResolvedGenerationConfig,
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
      for (const [key, { value, count }] of tallies) {
        const carrier = carriers.get(key) ?? {
          count: 0,
          origins: new Set<FixedValueOrigin>(),
        };
        carrier.count += count;
        carrier.origins.add(origin);
        carriers.set(key, carrier);
        fixedDisplay.set(key, String(value));
      }
      fixedByGroup.set(group, carriers);
    }
  };
  foldFixedValues(scope.fixedValues, 'prompt');
  foldFixedValues(scope.pedigreeFixedValues, 'pedigree');

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
    const { constraints, entry } = variable;

    if (
      constraints.minLength !== undefined &&
      constraints.maxLength !== undefined &&
      constraints.minLength > constraints.maxLength
    ) {
      report(
        [id],
        ['minLength', 'maxLength'],
        `minLength ${constraints.minLength} exceeds maxLength ${constraints.maxLength}`,
      );
    }

    if (
      constraints.minValue !== undefined &&
      constraints.maxValue !== undefined &&
      constraints.minValue > constraints.maxValue
    ) {
      report(
        [id],
        ['minValue', 'maxValue'],
        `minValue ${constraints.minValue} exceeds maxValue ${constraints.maxValue}`,
      );
    }

    if (
      constraints.minSelected !== undefined &&
      constraints.maxSelected !== undefined &&
      constraints.minSelected > constraints.maxSelected
    ) {
      report(
        [id],
        ['minSelected', 'maxSelected'],
        `minSelected ${constraints.minSelected} exceeds maxSelected ${constraints.maxSelected}`,
      );
    }

    // `maxSelected: 0` leaves the empty selection as the only drawable value,
    // and `required` is the one rule that rejects it. Without this the draw
    // emits `[]` and the interview refuses it — invalid data rather than a
    // refusal, which is the outcome this pass exists to prevent.
    if (constraints.required && constraints.maxSelected === 0) {
      report(
        [id],
        ['required', 'maxSelected'],
        'maxSelected 0 permits only an empty selection, which required rejects',
      );
    }

    // The same contradiction in the length rules: `maxLength: 0` leaves the
    // empty string as the only value it permits, and `required` rejects it.
    // `textDrawLength` picks length 0 and `fitToLength` emits `""`.
    if (constraints.required && constraints.maxLength === 0) {
      report(
        [id],
        ['required', 'maxLength'],
        'maxLength 0 permits only an empty string, which required rejects',
      );
    }

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

    // Counted over distinct values, not entries: two options carrying one
    // value offer a participant one thing to pick, and the draw collapses them
    // to a single selection. Counting entries would accept a floor no answer
    // can reach and leave the draw to emit a short selection the form rejects.
    const optionCount = distinctOptionValues(entry).length;
    if (
      constraints.minSelected !== undefined &&
      optionCount > 0 &&
      constraints.minSelected > optionCount
    ) {
      report(
        [id],
        ['minSelected'],
        `minSelected ${constraints.minSelected} exceeds the ${optionCount} available options`,
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
        // The widest of the group's members, because the group holds one value
        // and every entity carrying any member of it spends that value: a
        // variable a form fills on nine edges spends nine, however few carry
        // the member held equal to it.
        const holders = members.reduce(
          (most, member) => Math.max(most, scope.worstCaseCountFor(member)),
          0,
        );
        const size = valueSpaceSize(groups.get(group) ?? variable, holders);

        if (
          size !== 'unbounded' &&
          size < holders &&
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
          report(
            members,
            [
              'unique',
              ...(origins.has('prompt') ? ['additionalAttributes'] : []),
              ...(origins.has('pedigree') ? ['egoVariable'] : []),
            ],
            `${fixedBy(origins)} fixes ${members.length > 1 ? 'these variables, which are held equal,' : 'this'} to ${detail}, but unique allows one ${scope.entity} to hold a value`,
          );
        }
      }
    }
  }

  // A group's members all hold one value, so it has to satisfy every member's
  // bounds at once. Merged by `sameAs` or by a cycle of non-strict comparators,
  // members whose own ranges are each satisfiable can still leave no range
  // between them, and no draw can be inside a range that is not there.
  for (const [group, memberIds] of membersOf) {
    if (memberIds.length < 2) continue;

    const intersected = groups.get(group);
    if (intersected === undefined) continue;

    const members: ConstrainedVariable[] = [];
    for (const id of memberIds) {
      const member = entity.get(id);
      if (member !== undefined) members.push(member);
    }

    const crossings = emptyGroupBounds(members, intersected.constraints);
    if (crossings.length === 0) continue;

    const held = MERGING_RULES.filter((rule) =>
      memberIds.some((id) => {
        const target = entity.get(id)?.constraints[rule];
        return target !== undefined && memberIds.includes(target);
      }),
    );

    report(
      memberIds,
      [...held, ...crossings.flatMap((crossing) => crossing.rules)],
      'these variables are held to a single value, but their bounds do not ' +
        `overlap: ${crossings.map((crossing) => crossing.detail).join('; ')}`,
    );
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
    // A cycle is reported below with the reason that describes it; its members'
    // bounds crossing over is that same contradiction counted twice.
    if (component.some((group) => cyclicGroups.has(group))) continue;

    const members = new Set(component);
    const ids = [...entity.keys()].filter((id) =>
      members.has(groupOf.get(id) ?? id),
    );
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

    const members = new Set(component.groups);
    const ids = [...entity.keys()].filter((id) =>
      members.has(groupOf.get(id) ?? id),
    );
    report(
      ids,
      solvedComponentRules(entity, ids),
      'no combination of values these rules allow can satisfy all of them at once',
    );
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
  config: ResolvedGenerationConfig,
  externalData?: Record<string, NcNode[]>,
): ConstraintConflict[] {
  const counts = worstCaseEntityCounts(stages, config, externalData);
  const binOnly = collectBinOnlyVariables(stages);
  const promptFixed = countPromptFixedValues(stages, config, externalData);
  const pedigreeFixed = countPedigreeFixedValues(stages, config);
  const promptAssignments = collectPromptFixedAssignments(stages, externalData);
  const referenced = collectReferencedTypes(stages);
  const scopes: EntityScope[] = [
    {
      entity: 'ego',
      variables: codebook.ego?.variables,
      unvalidated: NO_UNVALIDATED_VARIABLES,
      worstCaseCountFor: () => 1,
      // No stage fixes a value on ego: `additionalAttributes` belongs to a
      // name-generator prompt, and a pedigree's ego flag to its own nodes, both
      // of whose subjects are always a node.
      fixedValues: NO_FIXED_VALUES,
      pedigreeFixedValues: NO_FIXED_VALUES,
      fixedAssignments: NO_FIXED_ASSIGNMENTS,
    },
  ];

  // A codebook type the stage list never names carries no entity: no stage
  // creates one, and nothing writes onto one. No value of its variables is ever
  // drawn or submitted, so a rule declared on them is never applied, and
  // analysing it refuses a protocol over a variable the run never reaches — a
  // Person-only interview blocked by an unused type's `minLength` above its
  // `maxLength`. Whole scopes are dropped rather than individual variables:
  // every stage that creates an entity generates its type's whole attribute
  // set, so a type with any carrier has no unpopulated variable to exempt.
  //
  // Asked of the type rather than of the counts, because the zeroes reaching
  // this pass do not all mean the same thing. An edge type's per-variable count
  // is zero for every variable no form fills, while its edges exist all the
  // same — a pedigree edge is born empty — so reading that zero as "unused"
  // would drop a contradiction on a type the run really does create. And ego
  // has no stage-derived count at all: it is a singleton the network always
  // carries, so its scope is never one of these.
  //
  // Both readers have to agree the type is absent. The schema's tags and
  // `worstCaseEntityCounts`' own field reads see the same stage list
  // independently, so neither a tag dropped from the schema nor a creating
  // stage the counter does not model can on its own delete a refusal.
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
      unvalidated: binOnly.get(type) ?? NO_UNVALIDATED_VARIABLES,
      // Every stage creating a node generates its whole attribute set, so a
      // fabricated node spends a value for each of the type's variables. Roster
      // rows are the one place that differs, and only for the variable whose
      // value they repeat — see `nodeCountFor`.
      worstCaseCountFor: (variableId) =>
        nodeCountFor(counts.node, type, variableId),
      fixedValues: promptFixed.get(type) ?? NO_FIXED_VALUES,
      pedigreeFixedValues: pedigreeFixed.get(type) ?? NO_FIXED_VALUES,
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
      // Both binning stages take a node subject, so no edge variable can be
      // bin-assigned.
      unvalidated: NO_UNVALIDATED_VARIABLES,
      worstCaseCountFor: (variableId) =>
        edgeCountFor(counts.edge, type, variableId),
      // `additionalAttributes` writes onto the nodes a prompt creates, never
      // onto an edge.
      fixedValues: NO_FIXED_VALUES,
      pedigreeFixedValues: NO_FIXED_VALUES,
      fixedAssignments: NO_FIXED_ASSIGNMENTS,
    });
  }

  return scopes.flatMap((scope) => analyseEntity(scope, config));
}
