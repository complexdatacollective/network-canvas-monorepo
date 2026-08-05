import { v4 as uuid } from 'uuid';

import type { AdditionalAttributes, Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import type { VariableEntry } from '../types';
import {
  claimFixedValues,
  generateAttributesForEntity,
  releaseRosterValues,
  reserveRosterValues,
  rosterRowIsDrawable,
} from './attributes';
import type { GenerationConfig } from './config';
import { dateValueResolution, stepsBetween } from './constraints/dateWindow';
import {
  completionCheckFor,
  type EntityScopeRef,
} from './constraints/generateEntityAttributes';
import {
  declaresNodeCollection,
  nodeVariablesWrittenOnCreation,
  withRuleTiedVariables,
} from './constraints/stageWrites';
import {
  COMPARATOR_DIRECTION,
  COMPARISON_RULES,
  type ConstrainedVariable,
  type EntityConstraints,
} from './constraints/types';
import { valueKey } from './constraints/uniqueRegistry';
import { distinctOptionValues } from './constraints/valueSpace';
import type { GenerationContext, StageOfType } from './context';
import { getSubjectType } from './subject';

/**
 * Node-subject stages that fabricate nodes: the three name-generator variants
 * and NetworkComposer (a from-scratch builder).
 */
export type NodeCreationStage = StageOfType<
  | 'NameGenerator'
  | 'NameGeneratorQuickAdd'
  | 'NameGeneratorRoster'
  | 'NetworkComposer'
>;

/**
 * Minimal prompt shape node creation needs: an id (for `promptIDs`) and any
 * additional attributes to stamp onto created nodes. NetworkComposer, which is
 * promptless, passes a synthetic `{ id }`.
 */
type NodeDrawPrompt = {
  id?: string;
  additionalAttributes?: AdditionalAttributes;
};

/**
 * Roster state for a name-generator stage.
 *
 * `pool` is the stage's unfiltered roster rows; the drawable rows are those in
 * `pool` not already in `used`. Presence of `pool` is load-bearing and
 * three-way: `undefined` means "no roster known" (the stage had no external
 * data entry), an empty array means "roster known to be empty" (the asset
 * resolved and parsed but yielded no rows, or a panel filtered them all out),
 * and a non-empty array is a roster with rows. A `NameGeneratorRoster` stage
 * fabricates only in the first case; a known-empty or exhausted roster produces
 * zero nodes. See `createNodesForStage`.
 */
export type RosterDraw = {
  pool?: NcNode[];
  /**
   * Roster rows already drawn, shared across all prompts and stages.
   *
   * Keyed by primary key, and read both to build a call's drawable pool and
   * again for every candidate that call judges — so a key drawn earlier in the
   * same draw turns away the rows repeating it, exactly as a key drawn by an
   * earlier stage does. One key admits one node per run: the interview's roster
   * excludes every entry sharing a key the moment one of them is added, and its
   * session reducer refuses a second node arriving under a key the network
   * already holds. Which of the rows a caller gave one key is drawn is settled
   * by the walk rather than by their order — see `createNodesForStage`.
   */
  used: Set<string>;
  /** Whether the stage may fabricate nodes beyond the roster. */
  allowFabrication: boolean;
};

function getPromptAdditionalAttributes(
  additional: AdditionalAttributes | undefined,
): Record<string, boolean> {
  if (!additional) return {};
  return additional.reduce<Record<string, boolean>>(
    (acc, { variable, value }) => ({ ...acc, [variable]: value }),
    {},
  );
}

/**
 * The nodes one value the draw never chose can be written onto, keyed by
 * variable id and then by the value's registry key. See
 * {@link countPromptFixedValues}.
 */
type FixedValueTally = {
  value: boolean;
  count: number;
  /**
   * The last stage that writes this value onto a node whatever the registry
   * already holds, if any does.
   *
   * A stage that may fabricate writes its prompt's value onto every node it
   * creates: where the row it would have drawn is passed over for holding a
   * value the network already has, it builds a node of its own and writes the
   * value there instead. Nothing stands between such a write and the finished
   * network, so a roster row offered before that stage can hold the same value
   * alongside it — see {@link countRosterCarriedValues}, which is what reads
   * this.
   *
   * `undefined` where every stage fixing the value draws from rows and only
   * from rows. Every node such a stage builds comes from a row the registry
   * judged first, and it is the merged assignment that is judged — the prompt's
   * value included — so the value reaches a node only where the network could
   * still take it.
   */
  stampedAt?: number;
};

export type PromptFixedValues = Map<string, Map<string, FixedValueTally>>;

/**
 * The values roster rows carry, keyed by variable id and then by the value's
 * registry key, each held against the first stage that can draw a row holding
 * it. See {@link countRosterCarriedValues}.
 *
 * The value itself is not kept. What reads this already holds it — a row is
 * only ever weighed against a value something else fixes, and that tally
 * carries the value it displays.
 */
export type RosterCarriedValues = Map<string, Map<string, number>>;

/** The name-generator variants, the only stages whose prompts fix a value. */
type PromptedNodeStage = StageOfType<
  'NameGenerator' | 'NameGeneratorQuickAdd' | 'NameGeneratorRoster'
>;

function isPromptedNodeStage(stage: Stage): stage is PromptedNodeStage {
  return (
    stage.type === 'NameGenerator' ||
    stage.type === 'NameGeneratorQuickAdd' ||
    stage.type === 'NameGeneratorRoster'
  );
}

/**
 * Whether the prompt a stage lists at `index` can create a node on any seed.
 *
 * `createNodesForStage` counts every prompt of a stage against one `maxNodes`
 * and draws at least `minNodes` of whatever that ceiling still leaves, so by
 * the time the prompt at `index` is reached the stage has already spent at
 * least `min(index * minNodes, maxNodes)`. Where that is the whole ceiling the
 * prompt returns before it draws — on every seed, not only on the ones where
 * the prompts before it drew generously — and its `additionalAttributes` reach
 * no node at all.
 *
 * A prompt that can draw on some seed is not judged by this: a value it fixes
 * lands on those seeds, and a fixed value nothing can satisfy is exactly the
 * seed-dependent failure the analysis exists to refuse ahead of time.
 */
function promptCanDraw(
  index: number,
  { minNodes, maxNodes }: { minNodes: number; maxNodes: number },
): boolean {
  return index * minNodes < maxNodes;
}

/**
 * How many nodes of each type a prompt's `additionalAttributes` can write each
 * of its values onto, keyed by node type.
 *
 * A prompt writes its additional attributes onto every node it creates, so
 * unlike a drawn value this one cannot vary with the seed — which makes it
 * decidable before any drawing whether more nodes than a `unique` variable
 * allows are going to end up holding it. Counted at each stage's node ceiling,
 * for the same reason the rest of feasibility counts worst cases.
 *
 * The ceiling belongs to the stage rather than to each of its prompts:
 * `createNodesForStage` counts every prompt of a stage against the same
 * `maxNodes`, so a stage allowed one node creates one node however many of its
 * prompts fix the value, and summing each prompt's independent maximum would
 * refuse a protocol that generates perfectly well. That capacity is spent in
 * prompt order, so the prompts past the point where it runs out spend nothing
 * at all — see {@link promptCanDraw}. Stages are summed against each other,
 * because a `unique` value is claimed once for the whole run.
 *
 * A roster stage is the one place a prompt's value can fail to land: the row's
 * own value for the variable wins there (see `createNodesForStage`), so only
 * the rows leaving it unset are counted.
 *
 * Where each value is written is recorded alongside how often — see
 * {@link FixedValueTally.stampedAt}, which is what decides whether a roster row
 * carrying the same value can be holding it at the same time.
 */
export function countPromptFixedValues(
  stages: Stage[],
  config: GenerationConfig,
  externalData: Record<string, NcNode[]> | undefined,
): Map<string, PromptFixedValues> {
  const byType = new Map<string, PromptFixedValues>();

  for (const [stageIndex, stage] of stages.entries()) {
    if (!isPromptedNodeStage(stage)) continue;

    const nodeType = getSubjectType(stage.subject, 'node');
    if (nodeType === undefined) continue;

    const bounds = getNodeCountBounds(stage, config);
    const { maxNodes } = bounds;
    const pool =
      stage.type === 'NameGeneratorRoster'
        ? externalData?.[stage.id]
        : undefined;
    // A roster stage handed rows builds every node from one; anything else may
    // fabricate, and writes its prompt's value onto whatever it fabricates.
    const fabricates = pool === undefined;

    const forStage: PromptFixedValues = new Map();

    for (const [index, prompt] of stage.prompts.entries()) {
      // The capacity a prompt is left runs out for good, so the first prompt
      // that cannot draw ends the stage's list rather than being stepped over.
      if (!promptCanDraw(index, bounds)) break;

      for (const { variable, value } of prompt.additionalAttributes ?? []) {
        const carriers = pool
          ? Math.min(
              maxNodes,
              pool.filter(
                (row) => row[entityAttributesProperty][variable] === undefined,
              ).length,
            )
          : maxNodes;
        if (carriers === 0) continue;

        const forVariable =
          forStage.get(variable) ?? new Map<string, FixedValueTally>();
        // Keyed as the registry keys it, so this counts the same values the
        // registry would judge equal.
        const key = valueKey(value);
        forVariable.set(key, {
          value,
          // The most this stage can spend, not the sum of what its prompts
          // could each spend alone: they share the stage's capacity.
          count: Math.max(forVariable.get(key)?.count ?? 0, carriers),
          ...(fabricates ? { stampedAt: stageIndex } : {}),
        });
        forStage.set(variable, forVariable);
      }
    }

    if (forStage.size === 0) continue;

    const forType: PromptFixedValues = byType.get(nodeType) ?? new Map();
    for (const [variable, values] of forStage) {
      const running =
        forType.get(variable) ?? new Map<string, FixedValueTally>();
      for (const [key, { value, count, stampedAt }] of values) {
        const carried = running.get(key);
        // The last stage stamping the value, because a roster row offered
        // before any of them can hold it alongside that stage's node.
        const stamped =
          stampedAt === undefined
            ? carried?.stampedAt
            : Math.max(carried?.stampedAt ?? stampedAt, stampedAt);
        running.set(key, {
          value,
          count: (carried?.count ?? 0) + count,
          ...(stamped === undefined ? {} : { stampedAt: stamped }),
        });
      }
      forType.set(variable, running);
    }
    byType.set(nodeType, forType);
  }

  return byType;
}

/**
 * The variables a stage settles for itself whatever row it draws: the ones
 * every prompt that can draw fixes.
 *
 * A stage that may fabricate spreads its prompt's `additionalAttributes` over
 * the row's own values, so a variable that prompt fixes is one the row never
 * writes — `fixedValuesFor` settles that merge, and `rosterRowIsDrawable` is
 * asked about the merged assignment for the same reason. It takes every
 * reachable prompt to settle it, because a row drawn under a prompt that fixes
 * nothing keeps its own value; a prompt the ceiling leaves nothing for settles
 * nothing, since no row is ever drawn under it (see {@link promptCanDraw}).
 *
 * A roster stage settles none of them: the row's value wins the collision
 * there, so every value a drawn row carries is written onto its node.
 */
function variablesEveryPromptFixes(
  stage: PromptedNodeStage,
  bounds: { minNodes: number; maxNodes: number },
): ReadonlySet<string> {
  if (stage.type === 'NameGeneratorRoster') return new Set();

  let shared: Set<string> | undefined;

  for (const [index, prompt] of stage.prompts.entries()) {
    if (!promptCanDraw(index, bounds)) break;

    const fixed = new Set<string>(
      (prompt.additionalAttributes ?? []).map(({ variable }) => variable),
    );
    shared =
      shared === undefined
        ? fixed
        : new Set([...shared].filter((variable) => fixed.has(variable)));
    if (shared.size === 0) break;
  }

  return shared ?? new Set();
}

/** What judging one node type's rows takes: its rules, and the draw's own check. */
type RowJudge = {
  constraints: EntityConstraints;
  canComplete: (fixed: Record<string, VariableValue>) => boolean;
};

/**
 * Whether any seed could build a node from a roster row — the half of
 * `createNodesForStage`'s pass-over the protocol settles, asked here of a row
 * the draw has not reached yet.
 *
 * The assignment judged is the one the node would be written with, merged in
 * whichever order the stage's interface settles a collision: a roster stage
 * lets the row's own value win, a name generator drawing a panel lets the
 * prompt's. Both readings are `fixedValuesFor`'s, and both halves of the
 * verdict are the primitives its `rulesAllow` composes — a rule the values
 * break between or within themselves, and a draw left no way to complete the
 * node around them. Neither consults the network, the registry or the seed, so
 * a row they reject is one no seed can draw.
 *
 * A row is drawable where ANY prompt admits it, because which prompt draws a
 * row is a seed's business. Prompts the stage's node ceiling leaves nothing for
 * are read alongside the rest: such a prompt can only keep a row that would
 * otherwise be excluded, which counts a carrier the run never builds, and that
 * is the safe direction.
 */
function rowCanBeDrawn(
  stage: PromptedNodeStage,
  row: NcNode,
  { constraints, canComplete }: RowJudge,
): boolean {
  const rowValues = row[entityAttributesProperty];
  const additional = stage.prompts.map((prompt) =>
    getPromptAdditionalAttributes(prompt.additionalAttributes),
  );
  // A stage with no prompt creates no node, so the row's own values are all
  // there would be to judge it by.
  const assignments = additional.length > 0 ? additional : [{}];

  return assignments.some((fixed) => {
    const merged: Record<string, VariableValue> =
      stage.type === 'NameGeneratorRoster'
        ? { ...fixed, ...rowValues }
        : { ...rowValues, ...fixed };

    return (
      ruleBrokenByFixedValues(constraints, merged) === undefined &&
      canComplete(merged)
    );
  });
}

/**
 * The values roster rows can carry into the network, keyed by node type, with
 * the first stage that can draw a row holding each of them.
 *
 * A row's values are the researcher's rather than the registry's, and the node
 * built from a row holds them: `createNodesForStage` generates around them
 * exactly as it generates around a prompt's `additionalAttributes`. So a value
 * a row carries and something else fixes has two writers and no draw between
 * either of them and the finished network — which is what makes it a question
 * for this pass rather than for the draw. What `rosterRowIsDrawable` settles at
 * the draw is only which node carries such a value: where the row is passed
 * over, a stage that may fabricate builds a node of its own and writes the
 * fixed value onto that instead, and the network holds the value twice.
 *
 * Read from every stage that draws rows rather than from the roster stages
 * alone, as `reserveExternalRosterValues` reads them: a name generator given a
 * panel draws its rows too, and their values reach the network the same way.
 *
 * The first stage offering each value is kept because the collision is one of
 * order: this says which values are on offer and from where, and
 * `analyseFeasibility` weighs each against {@link FixedValueTally.stampedAt}.
 * A row offered before the value is stamped can be drawn and claim it, leaving
 * the stamp to duplicate it; a row offered after meets a value the network
 * already holds and is passed over, which is the interview's own reading of a
 * roster as a pool of candidates rather than a list of people it must add.
 *
 * A row the rules leave dead carries nothing, and `nodeConstraints` is what
 * says so: a row whose merged values break a rule of their own, or leave the
 * draw no way to complete the node around them, is passed over on every seed,
 * so no node of the run ever holds them. That is the same static judgement
 * `createNodesForStage`'s own `rulesAllow` makes, from the same two primitives
 * over the same merged assignment, so the two cannot disagree about a row.
 * Without the lookup every row is counted, which over-refuses rather than
 * under-refuses.
 *
 * What stays loose is the order inside a stage. A row is kept where ANY of the
 * stage's prompts admits it, the prompts the node ceiling leaves nothing for
 * included: which prompt draws a row is a seed's business, and reading them
 * together can only keep a row some seed really reaches. So is the dynamic
 * direction, here as everywhere: a row the network's own values would turn away
 * when its stage runs is counted, because a different seed draws it before
 * whatever claimed the value. Both leave a value counted that some run does not
 * spend, which is the direction to err in for `unique` — the other one emits a
 * value two nodes hold, on every seed.
 *
 * One carrier per value however many rows carry it, and however many stages
 * offer them — the rows share the group's single `unique` slot, so the second
 * row offering a value the network already holds is passed over — but that is
 * `analyseFeasibility`'s to apply, since the slot is a whole equality group's
 * rather than one variable's.
 */
export function countRosterCarriedValues(
  stages: Stage[],
  config: GenerationConfig,
  externalData: Record<string, NcNode[]> | undefined,
  nodeConstraints?: (nodeType: string) => EntityConstraints | undefined,
): Map<string, RosterCarriedValues> {
  const byType = new Map<string, RosterCarriedValues>();
  // `completionCheckFor` resolves a whole type's generation order and solves its
  // tractable components, so a type's judge is built once rather than once per
  // stage offering rows of it.
  const judges = new Map<string, RowJudge | undefined>();
  const judgeFor = (nodeType: string): RowJudge | undefined => {
    if (nodeConstraints === undefined) return undefined;
    if (judges.has(nodeType)) return judges.get(nodeType);

    const constraints = nodeConstraints(nodeType);
    const judge =
      constraints === undefined
        ? undefined
        : { constraints, canComplete: completionCheckFor(constraints) };
    judges.set(nodeType, judge);
    return judge;
  };

  for (const [stageIndex, stage] of stages.entries()) {
    if (!isPromptedNodeStage(stage)) continue;

    const rows = externalData?.[stage.id];
    if (rows === undefined || rows.length === 0) continue;

    const nodeType = getSubjectType(stage.subject, 'node');
    if (nodeType === undefined) continue;

    const bounds = getNodeCountBounds(stage, config);
    // A stage that can build no node draws no row, so its rows carry nothing.
    if (bounds.maxNodes <= 0) continue;

    const settled = variablesEveryPromptFixes(stage, bounds);
    const judge = judgeFor(nodeType);
    const forType: RosterCarriedValues = byType.get(nodeType) ?? new Map();

    for (const row of rows) {
      if (judge !== undefined && !rowCanBeDrawn(stage, row, judge)) continue;

      for (const [variable, value] of Object.entries(
        row[entityAttributesProperty],
      )) {
        if (value === undefined) continue;
        if (settled.has(variable)) continue;

        const forVariable = forType.get(variable) ?? new Map<string, number>();
        // Keyed as the registry keys it, so the rows counted here are the ones
        // the registry would judge equal — and so a row's value meets a
        // prompt's under one key.
        const key = valueKey(value);
        forVariable.set(
          key,
          Math.min(forVariable.get(key) ?? stageIndex, stageIndex),
        );
        forType.set(variable, forVariable);
      }
    }

    if (forType.size > 0) byType.set(nodeType, forType);
  }

  return byType;
}

/**
 * The values one prompt's `additionalAttributes` write onto every node it
 * creates, keyed by node type, for the prompts whose whole set is certain to
 * land together.
 *
 * A value the protocol fixes leaves the draw nothing to choose, so it either
 * satisfies the rules as the protocol states it or nothing can make it —
 * decidable before any drawing. That holds of one value against its own rules
 * as much as of a pair against a rule spanning them, so a prompt fixing a
 * single variable is carried here too.
 *
 * A roster stage holding rows is left out. A row's own value wins over the
 * prompt's there, so which of a prompt's values reach one node depends on the
 * row drawn — data rather than protocol, settled at the draw by passing the row
 * over. A roster stage with no rows fabricates every node it makes, so its
 * prompt's values all land and it is counted here like any other.
 *
 * A prompt the stage's node ceiling leaves nothing for is left out too. Its
 * values are written onto no node on any seed, so nothing the protocol says
 * about them can be broken — see {@link promptCanDraw}.
 */
export function collectPromptFixedAssignments(
  stages: Stage[],
  config: GenerationConfig,
  externalData: Record<string, NcNode[]> | undefined,
): Map<string, Record<string, VariableValue>[]> {
  const byType = new Map<string, Record<string, VariableValue>[]>();

  for (const stage of stages) {
    if (!isPromptedNodeStage(stage)) continue;
    if (
      stage.type === 'NameGeneratorRoster' &&
      externalData?.[stage.id] !== undefined
    ) {
      continue;
    }

    const nodeType = getSubjectType(stage.subject, 'node');
    if (nodeType === undefined) continue;

    const bounds = getNodeCountBounds(stage, config);

    for (const [index, prompt] of stage.prompts.entries()) {
      if (!promptCanDraw(index, bounds)) break;

      const additional = prompt.additionalAttributes ?? [];
      if (additional.length === 0) continue;

      const values: Record<string, VariableValue> = {};
      for (const { variable, value } of additional) values[variable] = value;

      const forType = byType.get(nodeType) ?? [];
      forType.push(values);
      byType.set(nodeType, forType);
    }
  }

  return byType;
}

/**
 * A rule an entity's fixed values break: the two variables of a rule spanning
 * them, or the single variable whose own value its own rules reject.
 */
export type BrokenFixedRule = {
  /** The variables the rule covers, in the order the codebook declares them. */
  variableIds: string[];
  /** The fixed values those variables hold, in the same order. */
  values: VariableValue[];
  rule: string;
};

/**
 * Whether the interview would read a value as no answer at all. Mirrors the
 * runtime's `required` validator: a null, a blank string, a `NaN` number and an
 * empty selection are each what an untouched field holds.
 */
function isUnanswered(value: VariableValue): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Whether an option list offers a value.
 *
 * A categorical answer is the set of options ticked, so it is judged member by
 * member and an answer of any other shape is one no option control produces. An
 * empty list is not judged against at all: the schema requires two entries, so
 * a list with nothing in it belongs to a protocol still being drafted, and a
 * value cannot be outside a domain nobody has written yet.
 */
function optionsOffer(entry: VariableEntry, value: VariableValue): boolean {
  const offered = distinctOptionValues(entry);
  if (offered.length === 0) return true;

  const keys = new Set(offered.map((option) => valueKey(option)));

  if (entry.type === 'categorical') {
    return (
      Array.isArray(value) &&
      value.every((member) => keys.has(valueKey(member)))
    );
  }

  return keys.has(valueKey(value));
}

/**
 * The rule a value fixed on an entity breaks on its own, if any.
 *
 * Read the way the interview's own validators read the value a field holds:
 * each rule applies only once a value is present, judges only values of the
 * shape it can read, and leaves anything else alone rather than refusing it.
 * The bounds come from the same descriptor a drawn value is generated against,
 * so a value put on an entity is held to exactly what a drawn one is.
 *
 * An option list goes a step further than any validator does, because no
 * validator is what enforces it: an option control offers the values its list
 * holds and nothing else, so a value outside the list is one no participant
 * could have entered. That is the same reasoning by which a date picker's
 * window already closes at the last date the field offers.
 */
function ownRuleBroken(
  { entry, constraints }: ConstrainedVariable,
  value: VariableValue,
): string | undefined {
  const {
    required,
    minLength,
    maxLength,
    minValue,
    maxValue,
    minSelected,
    maxSelected,
    dateWindow,
  } = constraints;

  if (required && isUnanswered(value)) return 'required';
  // Every rule below applies only once a value is present; `required` owns
  // emptiness, exactly as it does in the runtime's validators.
  if (value === null) return undefined;

  if (!optionsOffer(entry, value)) return 'options';

  if (typeof value === 'string') {
    if (maxLength !== undefined && value.length > maxLength) return 'maxLength';
    if (minLength !== undefined && value !== '' && value.length < minLength) {
      return 'minLength';
    }
  }

  if (Array.isArray(value)) {
    if (maxSelected !== undefined && value.length > maxSelected) {
      return 'maxSelected';
    }
    // An empty selection is unanswered rather than too short, which is why the
    // runtime's `minSelected` leaves it to `required`.
    if (
      minSelected !== undefined &&
      value.length > 0 &&
      value.length < minSelected
    ) {
      return 'minSelected';
    }
  }

  if ((minValue !== undefined || maxValue !== undefined) && value !== '') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      if (minValue !== undefined && numeric < minValue) return 'minValue';
      if (maxValue !== undefined && numeric > maxValue) return 'maxValue';
    }
  }

  if (dateWindow !== undefined && typeof value === 'string' && value !== '') {
    const { resolution, min, max } = dateWindow;
    // A picker writes its dates at one resolution and no other, and offers only
    // days the calendar holds, so a value of any other shape is one the control
    // could neither have produced nor display: `2020-05-01` in a year picker,
    // `2020-02-31` in a full one. Judged before the window rather than
    // truncated into it, because a string naming no date the field offers has
    // no place inside the field's range either.
    if (dateValueResolution(value) !== resolution) return 'parameters';
    // Both ends are now written at the same resolution, so they order as
    // strings — which is how the runtime's own min/max validators compare them.
    if (min !== undefined && value < min) return 'parameters';
    if (max !== undefined && value > max) return 'parameters';
  }

  return undefined;
}

/**
 * Whether a comparator holds between two values neither of which is drawn.
 *
 * Read the way `applyComparatorBounds` reads a counterpart it is drawing
 * against: a datetime against a date, anything else against a number, and a
 * pair it cannot order left alone rather than judged.
 *
 * Dates are ordered as the runtime orders them. `compareVariables` parses both
 * ends with `new Date(...)`, and ECMAScript reads a date-only string as UTC
 * midnight beginning the period it names, so `2020` is the same instant as
 * `2020-01-01` and two values written at different resolutions still compare.
 * A string comparison would call `2020-01-01` the greater of that pair and
 * accept a strict comparator the interview rejects, which is why the two are
 * counted apart in days — the units `stepsBetween` reads a partial date in.
 */
function comparatorHolds(
  entry: VariableEntry,
  own: VariableValue,
  other: VariableValue,
  { ownerIsUpper, strict }: { ownerIsUpper: boolean; strict: boolean },
): boolean {
  if (entry.type === 'datetime') {
    if (typeof own !== 'string' || own === '') return true;
    if (typeof other !== 'string' || other === '') return true;
    if (dateValueResolution(own) === undefined) return true;
    if (dateValueResolution(other) === undefined) return true;
    const [upper, lower] = ownerIsUpper ? [own, other] : [other, own];
    const days = stepsBetween(lower, upper, 'full');
    return strict ? days > 0 : days >= 0;
  }

  const ownNumber = Number(own);
  const otherNumber = Number(other);
  if (Number.isNaN(ownNumber) || Number.isNaN(otherNumber)) return true;

  const [upper, lower] = ownerIsUpper
    ? [ownNumber, otherNumber]
    : [otherNumber, ownNumber];
  return strict ? upper > lower : upper >= lower;
}

/**
 * The first rule an entity's fixed values break, if any.
 *
 * A value put on an entity rather than drawn for it — a roster row's, a
 * prompt's `additionalAttributes` — is generated around rather than chosen: the
 * draw is asked only for the variables the fixed values leave over, and never
 * sees the fixed ones at all. So nothing between two of them is resolved by the
 * draw, and neither is anything about one of them on its own. Both have to be
 * judged before the assignment is accepted, or the entity ends up holding a
 * value no participant's form would have taken.
 *
 * Each value is judged against its own rules first. A value the variable's own
 * bounds already reject is the more direct account of why the entity cannot
 * hold it than whatever it does to a rule spanning it and something else.
 *
 * A value that is absent is passed over — the draw supplies it. A null is
 * passed over by the rules between values too, as the draw passes over a null
 * counterpart: a rule spanning two variables needs two values to be broken by.
 */
export function ruleBrokenByFixedValues(
  entity: EntityConstraints,
  fixed: Record<string, VariableValue>,
): BrokenFixedRule | undefined {
  return (
    ownRuleBrokenByFixedValues(entity, fixed) ??
    crossRuleBrokenByFixedValues(entity, fixed)
  );
}

/**
 * The first fixed value its own variable's bounds reject, if any.
 *
 * Split from the rules spanning two variables because the two halves are not
 * always answered the same way. A value breaking a bound of its own is a
 * complete statement on its own — whoever wrote it can be handed it back — while
 * a rule between two fixed values says only that the pair cannot stand, without
 * saying which of them was meant. {@link SyntheticInterview} refuses the second
 * and keeps the first, where the whole point of writing a value is to put a
 * chosen one in front of an interface.
 */
export function ownRuleBrokenByFixedValues(
  entity: EntityConstraints,
  fixed: Record<string, VariableValue>,
): BrokenFixedRule | undefined {
  for (const [id, variable] of entity) {
    if (!(id in fixed)) continue;
    // A key present without a value is what an emptied column arrives as, and
    // it settles the variable exactly as any other fixed value does.
    const value = fixed[id] ?? null;

    const rule = ownRuleBroken(variable, value);
    if (rule !== undefined) {
      return { variableIds: [id], values: [value], rule };
    }
  }

  return undefined;
}

/** The first rule spanning two of an entity's fixed values that they break. */
export function crossRuleBrokenByFixedValues(
  entity: EntityConstraints,
  fixed: Record<string, VariableValue>,
): BrokenFixedRule | undefined {
  const declared = [...entity.keys()];
  const held = (id: string): VariableValue | undefined => {
    const value = fixed[id];
    return value === null ? undefined : value;
  };

  for (const [id, { constraints, entry }] of entity) {
    const own = held(id);
    if (own === undefined) continue;

    const broken = (
      target: string,
      rule: string,
      other: VariableValue,
    ): BrokenFixedRule => {
      const targetFirst = declared.indexOf(target) < declared.indexOf(id);
      return {
        variableIds: targetFirst ? [target, id] : [id, target],
        values: targetFirst ? [other, own] : [own, other],
        rule,
      };
    };

    const { sameAs, differentFrom } = constraints;

    if (sameAs !== undefined) {
      const other = held(sameAs);
      if (other !== undefined && valueKey(other) !== valueKey(own)) {
        return broken(sameAs, 'sameAs', other);
      }
    }

    if (differentFrom !== undefined) {
      const other = held(differentFrom);
      if (other !== undefined && valueKey(other) === valueKey(own)) {
        return broken(differentFrom, 'differentFrom', other);
      }
    }

    for (const rule of COMPARISON_RULES) {
      const target = constraints[rule];
      if (target === undefined) continue;
      const other = held(target);
      if (other === undefined) continue;
      if (!comparatorHolds(entry, own, other, COMPARATOR_DIRECTION[rule])) {
        return broken(target, rule, other);
      }
    }
  }

  return undefined;
}

/**
 * Applies one hold to every `unique` value the rows of a stage's external data
 * carry, if the stage draws people from external data at all.
 */
function applyStageRosterHold(
  ctx: GenerationContext,
  stage: Stage,
  apply: (
    ctx: GenerationContext,
    ref: EntityScopeRef,
    rows: readonly NcNode[],
  ) => void,
): void {
  if (!isPromptedNodeStage(stage)) return;

  const rows = ctx.externalData?.[stage.id];
  if (rows === undefined || rows.length === 0) return;

  const nodeType = getSubjectType(stage.subject, 'node');
  if (nodeType === undefined) return;

  apply(ctx, { entity: 'node', type: nodeType }, rows);
}

/**
 * Holds back every `unique` value a roster row carries, for every stage that
 * draws people from external data and before any stage draws.
 *
 * A row is a real person the run may still add, carrying values the researcher
 * supplied rather than ones the registry issued. Held only while the row's own
 * stage was drawing, that guards nothing against the stages before it: a
 * fabricated node takes the value first, the row is then a duplicate of what
 * the network already holds, and `rosterRowIsDrawable` passes it over for good
 * — so the roster the protocol was written around loses a person that a
 * different draw would have left room for. The rows are data the run is given
 * up front, exactly as a prompt's `additionalAttributes` are protocol given up
 * front, so they are kept out of the earlier draws' way the same way.
 *
 * Reserved rather than claimed for the reason `reservePromptFixedValues` gives:
 * a row the draw never reaches holds nothing, and a draw left with nowhere else
 * to go takes a reserved value anyway.
 */
export function reserveExternalRosterValues(
  ctx: GenerationContext,
  stages: Stage[],
): void {
  for (const stage of stages) {
    applyStageRosterHold(ctx, stage, reserveRosterValues);
  }
}

/**
 * Gives a stage's roster hold back, once the stage has had its chance to draw.
 *
 * Rows are drawn per stage — `externalData` is keyed by stage id — so once a
 * stage is behind the run its undrawn rows are people nobody is waiting for,
 * and holding their values any longer would narrow every draw that follows for
 * nothing. A row that was drawn keeps its value through the claim made when it
 * arrived, so it needs no hold either. Each stage holds separately, so a stage
 * still to come that lists the same row keeps its own.
 *
 * A stage the run never reaches — skipped over by a skip-logic destination, or
 * past the point a simulated drop-out ended the interview — keeps its hold, as
 * a prompt whose stage is never reached keeps the one `reservePromptFixedValues`
 * took. Neither refuses a draw anything: a reservation only redirects.
 */
export function releaseExternalRosterValues(
  ctx: GenerationContext,
  stage: Stage,
): void {
  applyStageRosterHold(ctx, stage, releaseRosterValues);
}

/**
 * Takes a roster row the run can use from the drawable window `pool[from..]`,
 * swapping it into `pool[from]` so drawn rows stay behind the window.
 *
 * The starting point is random, as an undrawn pool is drawn in random order,
 * and the search walks on from there — so a pool with nothing to pass over
 * consumes exactly the one random number it always did, and picks exactly the
 * row it always did. `undefined` means the window holds no row the network can
 * still take, which is a roster whose remaining values are all spoken for or
 * whose remaining rows all break a rule between values nothing draws.
 */
function takeDrawableRosterRow(
  ctx: GenerationContext,
  pool: NcNode[],
  from: number,
  isDrawable: (row: NcNode) => boolean,
): NcNode | undefined {
  const window = pool.length - from;
  if (window <= 0) return undefined;

  const start = ctx.valueGen.randomInt(from, pool.length - 1);

  for (let step = 0; step < window; step++) {
    const index = from + ((start - from + step) % window);
    const candidate = pool[index]!;
    if (!isDrawable(candidate)) continue;

    pool[index] = pool[from]!;
    pool[from] = candidate;
    return candidate;
  }

  return undefined;
}

export function getNodeCountBounds(
  stage: NodeCreationStage,
  config: GenerationConfig,
): { minNodes: number; maxNodes: number } {
  const behaviours = 'behaviours' in stage ? stage.behaviours : undefined;
  const minNodes =
    behaviours && 'minNodes' in behaviours && behaviours.minNodes !== undefined
      ? behaviours.minNodes
      : config.nodeCount.min;
  const maxNodes =
    behaviours && 'maxNodes' in behaviours && behaviours.maxNodes !== undefined
      ? behaviours.maxNodes
      : config.nodeCount.max;
  // A configured minNodes above the max is honoured by raising the ceiling to
  // meet it. `maxNodes` is also the stage's capacity, so leaving the range
  // inverted would clamp the stage below the minimum the protocol asks for.
  return { minNodes, maxNodes: Math.max(maxNodes, minNodes) };
}

export function createNodesForStage(
  ctx: GenerationContext,
  stage: NodeCreationStage,
  prompt: NodeDrawPrompt,
  existingNodeCount: number,
  stageNodeCount: number,
  roster: RosterDraw,
): NcNode[] {
  const nodeType = getSubjectType(stage.subject, 'node');
  if (nodeType === undefined) return [];

  const nodeTypeDef = ctx.codebook.node?.[nodeType];
  if (!nodeTypeDef) return [];

  const { minNodes, maxNodes } = getNodeCountBounds(stage, ctx.config);
  const remaining = maxNodes - stageNodeCount;
  if (remaining <= 0) return [];

  // "Has a roster" means the stage was given a roster entry at all — the key is
  // present — regardless of how many rows it holds. This three-way distinction
  // drives NameGeneratorRoster fallback: no entry (`pool` undefined) fabricates;
  // an entry that is empty (roster known empty) or exhausted by an earlier stage
  // (drawable pool empty) produces zero nodes. The drawable pool below excludes
  // rows already used.
  const hasRoster = roster.pool !== undefined;

  const pool = roster.pool
    ? roster.pool.filter((n) => !roster.used.has(n[entityPrimaryKeyProperty]))
    : [];

  const requested = Math.min(
    ctx.valueGen.randomInt(minNodes, maxNodes),
    remaining,
  );
  const count =
    hasRoster && !roster.allowFabrication
      ? Math.min(requested, pool.length)
      : requested;

  const promptId = prompt.id ?? uuid();
  const additionalAttrs = getPromptAdditionalAttributes(
    prompt.additionalAttributes,
  );
  const newNodes: NcNode[] = [];
  let drawn = 0;

  const scope = { entity: 'node', type: nodeType } as const;
  const variableIds = Object.keys(nodeTypeDef.variables ?? {});
  // A creating stage fills only what that stage collects. A shared node type
  // may also carry pedigree semantics or variables collected much later; giving
  // those to a name generator would create a network no interview path can
  // produce. A roster (or an incomplete fixture with no declared collection
  // surface) keeps the conservative whole-type fallback because its rows decide
  // which values arrive.
  const stageWrites = declaresNodeCollection(stage)
    ? withRuleTiedVariables(
        nodeTypeDef.variables,
        nodeVariablesWrittenOnCreation(stage, [stage], prompt),
      )
    : new Set(variableIds);
  const constraints: EntityConstraints =
    ctx.entityConstraints.node.get(nodeType) ?? new Map();

  /** Every value the node is given rather than drawn, settled before the draw. */
  const fixedValuesFor = (
    row: NcNode | undefined,
  ): Record<string, VariableValue> => {
    if (row === undefined) return { ...additionalAttrs };

    const rosterValues = row[entityAttributesProperty];
    // The roster interface lets the roster value win a collision with a
    // prompt attribute, while a name generator panel lets the prompt win.
    return roster.allowFabrication
      ? { ...rosterValues, ...additionalAttrs }
      : { ...additionalAttrs, ...rosterValues };
  };

  const canComplete = completionCheckFor(constraints);

  /**
   * Whether the rules accept the assignment a row would be built from,
   * memoised by the row itself.
   *
   * The verdict is a function of the row and the prompt's own attributes, both
   * of which stand still for the whole draw, while `takeDrawableRosterRow`
   * walks the window afresh for every node it is asked for — so a pool of
   * hundreds is judged once per row here rather than once per row per node.
   *
   * Keyed by the row rather than by its primary key. Rows are data a caller
   * hands in, and hand-built data can carry one key on two rows holding
   * different values; a memo keyed that way would settle the second of them by
   * the first one's values, copying a row the rules reject into the network or
   * passing over one they accept, depending which of the two the walk reached
   * first. The row is what the assignment is read from, so it is what the
   * verdict belongs to.
   *
   * Only what the protocol settles is memoised. Whether the network can still
   * take the assignment's `unique` values is not: that changes as nodes are
   * built, and {@link rowIsDrawable} asks it afresh for every candidate.
   */
  const rowVerdicts = new WeakMap<NcNode, boolean>();
  const rulesAllow = (
    row: NcNode,
    fixed: Record<string, VariableValue>,
  ): boolean => {
    const memoised = rowVerdicts.get(row);
    if (memoised !== undefined) return memoised;

    // A row whose value its own rules reject, or whose values break a rule
    // between two of them or between one of them and a value the prompt fixes,
    // is passed over exactly as one repeating a `unique` value is: no draw
    // stands between those values and the finished node, so the row is simply
    // not one this protocol can use. A row that breaks nothing itself but
    // leaves the draw no value to satisfy a rule with is passed over for the
    // same reason — the node it would build is one whose drawn half cannot be
    // made to fit. Refusing instead would fail a roster of hundreds over rows
    // the draw might never have reached.
    const verdict =
      ruleBrokenByFixedValues(constraints, fixed) === undefined &&
      canComplete(fixed);
    rowVerdicts.set(row, verdict);
    return verdict;
  };

  /**
   * Whether the run can build a node from this row.
   *
   * Every judgement a row is put to reads one assignment: the values the node
   * will actually be written with, which `fixedValuesFor` settles by merging
   * the row with the prompt's `additionalAttributes` in whichever order the
   * stage's interface gives them. Judging the row as it arrived instead asks
   * about values the node may never hold — a variable the prompt overrides is
   * one the row never writes — and answers both ways round: a row the network
   * could take is passed over, and a row whose finished node repeats a value
   * the registry has already issued is drawn.
   *
   * A key the run has already spent is turned away before any of that. Rows are
   * data a caller hands in, and hand-built data can put one key on two rows, but
   * a key names one person: the roster interface drops every entry sharing a key
   * as soon as one of them is added, and the session reducer refuses a second
   * node arriving under a key the network holds. Read live rather than folded
   * into `pool`, so the copy drawn is the one this walk reaches first and is
   * judged by its own values — the reading the verdict memo above already gives
   * a repeated key, where a copy the rules reject must not answer for a copy
   * they accept.
   */
  const rowIsDrawable = (row: NcNode): boolean => {
    if (roster.used.has(row[entityPrimaryKeyProperty])) return false;

    const fixed = fixedValuesFor(row);
    return rosterRowIsDrawable(ctx, scope, fixed) && rulesAllow(row, fixed);
  };

  for (let i = 0; i < count; i++) {
    const nodeIndex = existingNodeCount + i;

    const wantsRosterRow =
      drawn < pool.length &&
      (!roster.allowFabrication ||
        ctx.valueGen.randomFloat(0, 1) < ctx.config.rosterDrawRatio);
    const picked = wantsRosterRow
      ? takeDrawableRosterRow(ctx, pool, drawn, rowIsDrawable)
      : undefined;

    // A roster stage builds nodes only from rows, so a pool holding none the
    // network can still take ends the stage — the alternative would be
    // fabricating a person for a stage whose people all come from the roster.
    if (wantsRosterRow && picked === undefined && !roster.allowFabrication) {
      break;
    }

    let primaryKey = uuid();
    const fixed = fixedValuesFor(picked);

    if (picked) {
      drawn += 1;

      primaryKey = picked[entityPrimaryKeyProperty];
      roster.used.add(primaryKey);
    }

    // A roster row and a prompt's `additionalAttributes` settle their variables
    // before anything is drawn, so the rest of the node is generated around the
    // values it actually ends up holding. Generating first and overwriting
    // after would leave a `sameAs`, `differentFrom` or comparator spanning a
    // fixed and a drawn variable broken on the finished node.
    const hasFixed = Object.keys(fixed).length > 0;
    const generated = generateAttributesForEntity(ctx, scope, nodeIndex, {
      existing: fixed,
      only: new Set(
        variableIds.filter((id) => stageWrites.has(id) && !(id in fixed)),
      ),
    });

    const attrs = { ...generated, ...fixed };
    if (hasFixed) claimFixedValues(ctx, scope, fixed);

    const node: NcNode = {
      [entityPrimaryKeyProperty]: primaryKey,
      type: nodeType,
      [entityAttributesProperty]: attrs,
      stageId: stage.id,
      promptIDs: [promptId],
    };
    newNodes.push(node);
  }

  return newNodes;
}
