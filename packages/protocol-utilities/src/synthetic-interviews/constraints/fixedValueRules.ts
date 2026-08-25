import type { VariableValue } from '@codaco/shared-consts';

import { dateValueResolution, stepsBetween } from './dateWindow';
import {
  COMPARATOR_DIRECTION,
  COMPARISON_RULES,
  type ConstrainedVariable,
  type EntityConstraints,
} from './types';
import { valueKey } from './uniqueRegistry';
import { distinctOptionValues } from './valueSpace';
import type { VariableEntry } from './variableEntry';

/**
 * Judgement of values an entity was GIVEN rather than drawn — a pedigree's
 * structural slots, an overrides entry's explicit attributes.
 *
 * Relocated from the deleted G2 engine's `generateNetwork/nodes.ts`, where the
 * reasoning below was worked out; the constraints now arrive from this
 * package's own analysis. A fixed value never passes through the draw, so
 * nothing between two of them is resolved by it and neither is anything about
 * one of them on its own — both have to be judged before the assignment is
 * accepted, or the entity ends up holding a value no participant's form would
 * have taken.
 */

/**
 * A rule an entity's fixed values break: the two variables of a rule spanning
 * them, or the single variable whose own value its own rules reject.
 */
export type BrokenFixedRule = {
  /** The variables the rule covers, in the order the codebook declares them. */
  variableIds: string[];
  /** The fixed values those variables hold, in the same order. */
  values: FixedVariableValue[];
  rule: string;
};

type FixedVariableValue = VariableValue | null;

/**
 * Whether the interview would read a value as no answer at all. Mirrors the
 * runtime's `required` validator: a null, a blank string, a `NaN` number and an
 * empty selection are each what an untouched field holds.
 */
function isUnanswered(value: FixedVariableValue): boolean {
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
 *
 * Exported for the slides-form simulators, which ask the same question of a
 * PREFILLED value: a form initialises its fields from the entity's current
 * attributes and refuses to advance while one of them fails validation, so a
 * roster-supplied value these rules reject is one the participant was made to
 * correct.
 */
export function ownRuleBroken(
  { entry, constraints }: ConstrainedVariable,
  value: FixedVariableValue,
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
  fixed: Readonly<Record<string, FixedVariableValue>>,
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
 * complete statement on its own — whoever wrote it can be handed it back —
 * while a rule between two fixed values says only that the pair cannot stand,
 * without saying which of them was meant. The overrides channel refuses the
 * second and keeps the first, where the whole point of writing a value is to
 * put a chosen one in front of an interface; the pedigree materializer holds
 * its structural values to both.
 */
function ownRuleBrokenByFixedValues(
  entity: EntityConstraints,
  fixed: Readonly<Record<string, FixedVariableValue>>,
): BrokenFixedRule | undefined {
  for (const [id, variable] of entity) {
    if (!(id in fixed)) continue;
    const value = fixed[id];
    if (value === undefined) continue;
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
  fixed: Readonly<Record<string, FixedVariableValue>>,
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
