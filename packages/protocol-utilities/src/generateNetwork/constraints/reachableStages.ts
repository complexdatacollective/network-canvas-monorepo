import {
  isStageSkipped,
  resolveSkipLogicDestinationIndex,
} from '@codaco/network-query';
import {
  type Stage,
  type StructuralCodebook,
  VARIABLE_REFERENCE_VALIDATIONS,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
  type VariableValue,
} from '@codaco/shared-consts';

import type { VariableEntry } from '../../types';
import { toVariableEntry } from '../attributes';
import {
  resolveVariableSynthetic,
  type ResolvedVariableSynthetic,
} from '../plan/resolveSynthetic';
import { booleanDomainValues } from './valueSpace';

const EMPTY_NETWORK: NcNetwork = {
  ego: {
    [entityPrimaryKeyProperty]: 'synthetic-reachability-ego',
    [entityAttributesProperty]: {},
  },
  nodes: [],
  edges: [],
};

/** The reachability ego, holding whatever the seed cannot move. */
const egoHolding = (
  attributes: ReadonlyMap<string, VariableValue>,
): NcNetwork =>
  attributes.size === 0
    ? EMPTY_NETWORK
    : {
        ...EMPTY_NETWORK,
        ego: {
          [entityPrimaryKeyProperty]: 'synthetic-reachability-ego',
          [entityAttributesProperty]: Object.fromEntries(attributes),
        },
      };

const NO_FIELDS: ReadonlySet<string> = new Set();

/** The ego variables one stage's form collects; nothing, unless it is a form. */
function egoFormFields(stage: Stage): ReadonlySet<string> {
  if (stage.type !== 'EgoForm') return NO_FIELDS;
  const fields = new Set<string>();
  for (const field of stage.form?.fields ?? []) {
    // Tolerated as a draft: Architect previews a form whose field has no
    // variable chosen yet.
    if (typeof field.variable === 'string') fields.add(field.variable);
  }
  return fields;
}

/**
 * The value the draw will give a variable whatever the seed is, or nothing
 * where the seed can still move it.
 *
 * Every branch here has to answer for the value the DRAW produces rather than
 * the one the descriptor names, because a pin that disagrees with the plan's
 * ego would settle a guard the planner then decides the other way. So the
 * types whose draw can re-shape a declared value are deliberately left out:
 *
 * - **categorical** answers with a SET, whose size is drawn from the selection
 *   count table even where one option carries all the weight.
 * - **ordinal** is a weighted index draw. A single positive weight does pick
 *   one option, but only where the weights are the resolved ones — an option
 *   list carrying a zero weight it never declared reads as deliberate — and
 *   the case is rare enough that proving it exactly is not worth the risk of
 *   getting it wrong in the unsafe direction.
 * - **text** is fabricated by faker, which is seeded.
 * - **datetime** is written at the resolution its picker collects, and a
 *   declared constant is completed and truncated against a window built from
 *   the control's own parameters ({@link buildVariableConstraints}). The
 *   string a guard compares against is therefore not the one the descriptor
 *   holds, and restating that derivation here is exactly the second opinion
 *   this pass must not form.
 */
function seedIndependentValue(
  entry: VariableEntry,
  resolved: ResolvedVariableSynthetic,
): VariableValue | undefined {
  switch (resolved.kind) {
    case 'boolean': {
      // The fallback rate is nobody's declaration, and the highlight rate that
      // replaces it on a Sociogram is neither; only an authored 0 or 1 settles.
      if (!resolved.declared) return undefined;
      if (resolved.probabilityTrue !== 0 && resolved.probabilityTrue !== 1) {
        return undefined;
      }
      // `stream.bool` decides a Bernoulli draw only where the variable offers
      // both values. A Boolean control whose options narrow the domain is
      // walked positionally instead, and the declared probability never
      // reaches it.
      const domain = booleanDomainValues(entry);
      if (!domain.includes(true) || !domain.includes(false)) return undefined;
      return resolved.probabilityTrue === 1;
    }

    case 'number': {
      if (resolved.descriptor.distribution !== 'constant') return undefined;
      const { value } = resolved.descriptor;
      const { min, max } = resolved.bounds;
      // A number bounded ABOVE and not below picks up a derived floor
      // (`withFallbackFloor`) that the clamp then applies, so the value the
      // draw returns is not necessarily the one declared. Left unsettled
      // rather than re-derived.
      if (min === undefined && max !== undefined) return undefined;
      if (min !== undefined && value < min) return undefined;
      if (max !== undefined && value > max) return undefined;
      return value;
    }

    case 'scalar': {
      if (resolved.descriptor.distribution !== 'constant') return undefined;
      const { value } = resolved.descriptor;
      const { min, max } = resolved.bounds;
      // The unit scale, which a scalar always draws inside; a constant outside
      // it comes back clamped.
      if (min !== undefined && value < min) return undefined;
      if (max !== undefined && value > max) return undefined;
      return value;
    }

    // Listed rather than defaulted, so a new resolved kind has to be judged
    // here rather than inheriting a silent "seed-independent: no".
    case 'ordinal':
    case 'categorical':
    case 'datetime':
    case 'text':
    case 'stageOwned':
      return undefined;
  }
}

/**
 * What ego holds before a seed is chosen: the values every draw produces, and
 * the variables no draw ever leaves a value for.
 *
 * Both readings are the plan's own, deliberately narrowed to the variables
 * whose draw nothing else can reach:
 *
 * - Nothing that takes part in an equality group or a comparison. The plan
 *   draws ego through the constraint solver, which settles a whole component
 *   at once and may put a group's value somewhere its own descriptor never
 *   would; and a `sameAs` sibling also takes the missingness decision for the
 *   group (`groupMissingProbability`). Named in EITHER direction, because a
 *   rule on another variable is what joins this one to its group.
 * - Nothing `unique`. A `unique` draw walks a distinct-value sequence rather
 *   than the distribution, so a Boolean declared certain comes back as
 *   whichever value the slot's sequence is up to.
 * - `missingProbability` of exactly 1 makes the value certainly ABSENT, which
 *   is what the empty-ego reading below already models. The conditions are
 *   `applyMissingness`'s own (its `certainlyMissingVariables`): a required
 *   member takes the group to zero — `resolveVariableSynthetic` applies that
 *   for us — no ego value is ever settled by a creating interaction, and the
 *   group is this variable alone because anything grouped is already excluded.
 * - Anything between 0 and 1 leaves the seed deciding whether the value is
 *   there at all, so it settles nothing either way.
 */
function settledEgoValues(codebook: StructuralCodebook): {
  values: Map<string, VariableValue>;
  certainlyAbsent: Set<string>;
} {
  const values = new Map<string, VariableValue>();
  const certainlyAbsent = new Set<string>();
  const variables = codebook.ego?.variables;
  if (variables === undefined) return { values, certainlyAbsent };

  // Read through the same entry the draw itself resolves a variable from, so
  // the validation rules seen here are the ones that reach it.
  const entries = Object.entries(variables).map(
    ([id, variable]) => [id, variable, toVariableEntry(id, variable)] as const,
  );

  const grouped = new Set<string>();
  for (const [id, , entry] of entries) {
    for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
      const target = entry.validation?.[rule];
      if (typeof target !== 'string') continue;
      grouped.add(id);
      grouped.add(target);
    }
  }

  for (const [id, variable, entry] of entries) {
    if (grouped.has(id)) continue;
    if (entry.validation?.unique === true) continue;

    const resolved = resolveVariableSynthetic(variable);
    if (resolved.kind === 'stageOwned') continue;
    if (resolved.missingProbability === 1) {
      certainlyAbsent.add(id);
      continue;
    }
    if (resolved.missingProbability !== 0) continue;

    const value = seedIndependentValue(entry, resolved);
    if (value !== undefined) values.set(id, value);
  }

  return { values, certainlyAbsent };
}

/**
 * How a stage's guard reads before anything is drawn, and whether the planner
 * is bound to read it the same way.
 */
type GuardReading = {
  /** `undefined` where the seed still decides it. */
  skipped: boolean | undefined;
  /**
   * Whether `planNetwork`'s own `guardSettlesSkip` must reach this answer.
   *
   * False does not mean the answer is wrong; it means the plan's drawn ego
   * could decide the stage the other way, so nothing this stage writes may be
   * treated as certainly written.
   */
  bindsPlanner: boolean;
};

/**
 * A guard reads the session as it stood when the participant ARRIVED at the
 * stage, so a form's own fields are never part of it — including, and
 * especially, a guard that reads a field its own form collects. That case is
 * self-referential: the only thing that could answer the field is the stage
 * the guard decides about. Live (`buildStageAvailabilityMap`), a `SKIP` on
 * `NOT_EXISTS` hides the form and the field stays unanswered for good, while
 * one on `EXISTS` lets the form run and the answer arrives too late to have
 * hidden it — both the reading below produces.
 *
 * `planNetwork`'s `guardSettlesSkip` projects ego strictly before the guarded
 * stage for the same reason, so the two passes cannot disagree and no carve-out
 * is needed here.
 */
function guardReading(
  stage: Stage,
  possibleEgoAttributes: ReadonlySet<string>,
  settledEgoAttributes: ReadonlyMap<string, VariableValue>,
): GuardReading {
  const { skipLogic } = stage;
  if (skipLogic === undefined) return { skipped: false, bindsPlanner: true };

  // A guard with any non-ego rule is one `guardSettlesSkip` refuses outright,
  // so the plan keeps the stage — as this pass does by declining to settle it.
  if (skipLogic.filter.rules.some((rule) => rule.type !== 'ego')) {
    return { skipped: undefined, bindsPlanner: true };
  }

  const attributes: string[] = [];
  for (const rule of skipLogic.filter.rules) {
    const attribute =
      'attribute' in rule.options ? rule.options.attribute : undefined;
    if (attribute !== undefined) attributes.push(attribute);
  }

  for (const attribute of attributes) {
    if (!possibleEgoAttributes.has(attribute)) continue;
    if (settledEgoAttributes.has(attribute)) continue;
    return { skipped: undefined, bindsPlanner: false };
  }

  return {
    skipped: isStageSkipped(skipLogic, egoHolding(settledEgoAttributes)),
    bindsPlanner: true,
  };
}

/**
 * The stages feasibility may need to analyse before generation starts.
 *
 * Only stages proven unreachable are removed. A guard is decidable here when
 * every attribute its rules read is one the session's ego provably holds the
 * same value for on every seed: an attribute no earlier reachable EgoForm can
 * write (absent, as the empty ego models it), one a variable's own
 * missingness makes certainly unanswered, or one an earlier reachable EgoForm
 * collects whose declared `synthetic` leaves the seed nothing to decide — a
 * Boolean at `probabilityTrue: 0` or `1`, a constant number or scalar.
 * Anything else stays in the conservative pre-pass.
 *
 * The seed-independent half is what stops a creator the session ALWAYS skips
 * from failing generation on constraints for entities that never exist: three
 * skipped nodes carrying a `unique` Boolean between them are unsatisfiable on
 * paper, and `analyseFeasibility` runs before `planNetwork` — which settles
 * the same guard against its drawn ego — can remove them. What is refused now
 * is what the live session could actually run into.
 *
 * Every settle is one `planNetwork`'s `guardSettlesSkip` is bound to make the
 * same way, because settling one the other way is the strictly worse failure:
 * feasibility would skip the constraints of entities the plan then builds, and
 * generation would fail partway through a plan rather than accept a protocol
 * it need not have refused.
 */
export function reachableStagesForFeasibility(
  /**
   * The codebook as the caller supplied it, before `applyComposerRenderings`
   * — which runs on the stages this returns. Nothing is lost by reading it
   * first: a composer rendering resolves against a node or edge subject and
   * skips an ego one outright, so ego's variables are the same in both, and a
   * rendering only ever narrows a value space rather than settling one.
   */
  codebook: StructuralCodebook,
  stages: Stage[],
  respectSkipLogicAndFiltering: boolean,
): Stage[] {
  if (!respectSkipLogicAndFiltering) return stages;

  const { values: settledEgo, certainlyAbsent } = settledEgoValues(codebook);

  const reachable: Stage[] = [];
  const possibleEgoAttributes = new Set<string>();
  const settledEgoAttributes = new Map<string, VariableValue>();
  /**
   * Stages the PLAN's own walk may not arrive at, though this one does.
   *
   * A form standing inside one cannot be treated as having written anything:
   * the plan projects ego through the analysis its settled jumps leave behind
   * (`viewAfterJump`), so a form it jumps over writes nothing at all, and a
   * value pinned from such a form would answer a later guard about an
   * attribute the plan's ego does not hold.
   */
  const unreachableByPlan = new Set<number>();

  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index]!;
    const ownFormFields = egoFormFields(stage);
    const { skipped, bindsPlanner } = guardReading(
      stage,
      possibleEgoAttributes,
      settledEgoAttributes,
    );

    const destinationIndex =
      stage.skipLogic?.destination === undefined
        ? undefined
        : resolveSkipLogicDestinationIndex(
            stage.skipLogic.destination,
            stages,
            index,
          );

    if (skipped === true) {
      if (destinationIndex !== undefined) index = destinationIndex - 1;
      continue;
    }

    reachable.push(stage);

    // A guard the plan can settle takes its own stage with it, and every stage
    // between it and its destination — the plan walks the jump, so those
    // stages belong to one ego draw and not to another.
    if (!bindsPlanner) {
      unreachableByPlan.add(index);
      if (destinationIndex !== undefined) {
        for (let jumped = index + 1; jumped < destinationIndex; jumped++) {
          unreachableByPlan.add(jumped);
        }
      }
    }

    if (stage.type === 'EgoForm') {
      // The fields this form actually collects, not every ego variable the
      // codebook declares. An EgoForm is the only thing that writes onto ego,
      // so a variable no reachable form asks for is one the session never
      // holds — and treating it as merely possible leaves a stage guarded on
      // it undecidable, which keeps a stage the run provably never reaches.
      // The planner then gives that stage part of a population nothing builds.
      for (const field of ownFormFields) {
        // A field whose value is certainly unanswered is not a value the
        // session holds, so it stays absent rather than becoming possible.
        if (certainlyAbsent.has(field)) continue;
        possibleEgoAttributes.add(field);
        const settled = settledEgo.get(field);
        if (settled !== undefined && !unreachableByPlan.has(index)) {
          settledEgoAttributes.set(field, settled);
        }
      }
    }
  }

  return reachable;
}
