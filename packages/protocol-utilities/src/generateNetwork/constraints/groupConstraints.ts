import type { VariableEntry, VariableOptionInput } from '../../types';
import {
  addSteps,
  type DateResolution,
  dateValueResolution,
  EARLIEST_OFFERED_DATE,
  LATEST_OFFERED_DATE,
} from './dateWindow';
import {
  canonicalComparatorEdges,
  type ComparatorEdge,
  KEY_SEPARATOR,
} from './dependencyOrder';
import type {
  ConstrainedVariable,
  EntityConstraints,
  VariableConstraints,
} from './types';
import {
  booleanDomainValues,
  decimalGrid,
  decimalGridStep,
  numberDrawBounds,
  scalarDrawGrid,
} from './valueSpace';

/**
 * Keeps whichever of two bounds is tighter. Dates are compared as strings,
 * which orders them correctly as long as both are written at the same
 * resolution — every caller here either checks that or writes the candidate at
 * the current bound's resolution first, which is what `comparatorBound` does.
 */
export function tighten<T extends number | string>(
  current: T | undefined,
  candidate: T | undefined,
  keepHigher: boolean,
): T | undefined {
  if (candidate === undefined) return current;
  if (current === undefined) return candidate;
  const candidateIsTighter = keepHigher
    ? candidate > current
    : candidate < current;
  return candidateIsTighter ? candidate : current;
}

/**
 * The values a variable's rendered control lets it hold where that domain is
 * discrete and finite.
 */
function optionDomain(
  variable: ConstrainedVariable,
): VariableOptionInput[] | undefined {
  const { entry } = variable;
  if (entry.type === 'boolean') {
    return booleanDomainValues(entry).map((value) => ({
      label: String(value),
      value,
    }));
  }
  if (entry.type !== 'ordinal' && entry.type !== 'categorical') {
    return undefined;
  }
  return entry.options ?? [];
}

/**
 * The option values every member of a group that has options offers, or
 * `undefined` where no member has any and there is nothing to intersect.
 *
 * A member with no options of its own is passed over rather than emptying the
 * intersection. A group mixing an ordinal with a type that has no option domain
 * is refused for its types rather than its options — see
 * `incompatibleGroupTypes` — and reading "offers no options" as "shares none of
 * them" would report that same group a second time as an options conflict,
 * naming a list a researcher could edit forever without fixing anything.
 */
function sharedOptionValues(
  members: readonly ConstrainedVariable[],
): Set<VariableOptionInput['value']> | undefined {
  let shared: Set<VariableOptionInput['value']> | undefined;

  for (const member of members) {
    const options = optionDomain(member);
    if (options === undefined) continue;

    const offered = new Set(options.map((option) => option.value));
    shared =
      shared === undefined
        ? offered
        : new Set([...shared].filter((value) => offered.has(value)));
  }

  return shared;
}

/**
 * The entry a group draws against: the representative's, offering only the
 * options every member can hold. Two ordinals held equal over `{1, 2}` and
 * `{3, 4}` would otherwise draw the representative's `1`, which the other
 * member's field cannot show and its validator cannot accept.
 *
 * Members sharing no option at all keep the representative's own, the way
 * `propagateComparatorBounds` keeps a group's declared range when its bounds
 * cross over: the feasibility pass refuses that protocol either way, and until
 * it does, a value one member can hold beats the nothing an empty option list
 * draws.
 */
function intersectEntry(
  representative: ConstrainedVariable,
  members: readonly ConstrainedVariable[],
): VariableEntry {
  const own = optionDomain(representative);
  if (own === undefined) return representative.entry;

  const shared = sharedOptionValues(members);
  if (shared === undefined) return representative.entry;

  const options = representative.entry.options;
  if (representative.entry.type === 'boolean') {
    if (
      shared.size === 0 ||
      (shared.size === own.length &&
        own.every((option) => shared.has(option.value)))
    ) {
      return representative.entry;
    }
    return {
      ...representative.entry,
      component: 'Boolean',
      options: [...shared].map((value) => ({
        label: String(value),
        value,
      })),
    };
  }

  if (options === undefined) return representative.entry;
  const narrowed = options.filter((option) => shared.has(option.value));
  if (narrowed.length === 0 || narrowed.length === options.length) {
    return representative.entry;
  }

  return { ...representative.entry, options: narrowed };
}

/**
 * The rules the single value shared by a `sameAs` group must satisfy: the
 * tightest of every member's bounds rather than any one member's. A member
 * capped at `maxLength: 24` joined to one requiring `minLength: 24` needs a
 * value of exactly 24 characters, which neither member alone would produce.
 *
 * The representative supplies the type. A group whose members do not agree on
 * one is refused before anything is drawn, so which member supplies it decides
 * nothing a generated value depends on.
 */
function intersectConstraints(
  members: readonly ConstrainedVariable[],
  representative: ConstrainedVariable,
): VariableConstraints {
  let required = false;
  let unique = false;
  let minLength: number | undefined;
  let maxLength: number | undefined;
  let minValue: number | undefined;
  let maxValue: number | undefined;
  let minSelected: number | undefined;
  let maxSelected: number | undefined;

  const resolution = representative.constraints.dateWindow?.resolution;
  let windowMin: string | undefined;
  let windowMax: string | undefined;
  // Whether the ceiling the group settles on is a stand-in for an absent
  // bound rather than a declared rule. Only the members that actually set it
  // have a say, and one member declaring that same ceiling makes it a rule
  // for the group — a stand-in may be moved to reach a synthetic window, and
  // a rule may not.
  let windowMaxDerived = false;

  for (const { constraints } of members) {
    required ||= constraints.required;
    unique ||= constraints.unique;
    minLength = tighten(minLength, constraints.minLength, true);
    maxLength = tighten(maxLength, constraints.maxLength, false);
    minValue = tighten(minValue, constraints.minValue, true);
    maxValue = tighten(maxValue, constraints.maxValue, false);
    minSelected = tighten(minSelected, constraints.minSelected, true);
    maxSelected = tighten(maxSelected, constraints.maxSelected, false);

    // Bounds written at different resolutions do not compare as strings, so
    // only a window matching the representative's resolution contributes. A
    // group whose members disagree on one is refused before anything is drawn,
    // so passing the others over decides nothing a generated value depends on.
    const window = constraints.dateWindow;
    if (window !== undefined && window.resolution === resolution) {
      windowMin = tighten(windowMin, window.min, true);
      if (window.max !== undefined) {
        if (windowMax === undefined || window.max < windowMax) {
          windowMax = window.max;
          windowMaxDerived = window.maxDerived === true;
        } else if (window.max === windowMax) {
          windowMaxDerived &&= window.maxDerived === true;
        }
      }
    }
  }

  return {
    required,
    unique,
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(minValue !== undefined ? { minValue } : {}),
    ...(maxValue !== undefined ? { maxValue } : {}),
    ...(minSelected !== undefined ? { minSelected } : {}),
    ...(maxSelected !== undefined ? { maxSelected } : {}),
    ...(resolution !== undefined
      ? {
          dateWindow: {
            resolution,
            ...(windowMin !== undefined ? { min: windowMin } : {}),
            ...(windowMax !== undefined ? { max: windowMax } : {}),
            ...(windowMaxDerived ? { maxDerived: true } : {}),
          },
        }
      : {}),
  };
}

/**
 * Each group's combined rules, keyed by its representative id.
 *
 * The generator and the feasibility pass both read this, because both have to
 * describe the same value: a group draws once against the intersection, so a
 * `unique` value space measured against one member's own bounds would describe
 * a space the generator never draws from.
 */
export function intersectGroupConstraints(
  entity: EntityConstraints,
  membersOf: Map<string, string[]>,
): Map<string, ConstrainedVariable> {
  const groups = new Map<string, ConstrainedVariable>();

  for (const [group, memberIds] of membersOf) {
    const representative = entity.get(group);
    if (representative === undefined) continue;

    const members: ConstrainedVariable[] = [];
    for (const id of memberIds) {
      const member = entity.get(id);
      if (member !== undefined) members.push(member);
    }

    groups.set(group, {
      entry: intersectEntry(representative, members),
      constraints: intersectConstraints(members, representative),
    });
  }

  return groups;
}

/** Something a group's members leave no value between them for. */
type EmptyGroupBound = {
  /** The constraint keys that cross. */
  rules: string[];
  /** What crossed, worded as the per-variable checks word it. */
  detail: string;
};

const INTERSECTED_BOUNDS = [
  { min: 'minValue', max: 'maxValue' },
  { min: 'minLength', max: 'maxLength' },
  { min: 'minSelected', max: 'maxSelected' },
] as const;

/**
 * Said of a bound pair a member's own declaration already crosses, so the group
 * conflict and the per-variable conflict raised for that member cannot be read
 * as the same fact reported twice.
 */
const ALSO_DECLARED =
  ', which one of these variables already declares on its own';

/**
 * The values a variable's type can hold, as a key two types share only when one
 * value could sit in either of them.
 *
 * `number` and `scalar` share one: both are drawn as plain numbers, and a
 * scalar's 0-1 scale reaches the group as `minValue`/`maxValue`, so the
 * intersected bounds already confine the draw to a value either can carry — and
 * where they cannot, the `minValue`/`maxValue` crossing reports it.
 *
 * Nothing else shares one with anything but itself. `text` and `datetime` are
 * both written as strings, but only one of them holds `"Elda"`, and holding the
 * group to dates instead would owe the text member the `minLength`/`maxLength`
 * it declared, which no date format can be asked to meet. `ordinal` and
 * `categorical` are both drawn from options, but a categorical value is an
 * array of them and an ordinal value is a single one.
 */
function valueKind(type: VariableEntry['type']): string {
  return type === 'scalar' ? 'number' : type;
}

/**
 * The types a group's members cannot all hold one value of.
 *
 * `sameAs` names a variable id and the schema asks nothing of the type it
 * names, so a text variable can be held equal to a boolean. The group keeps one
 * of the two types and draws a single value against it, which leaves the other
 * member holding something no participant control could have produced for it: a
 * boolean attribute reading `"Elda"`, or a text attribute reading `false`. The
 * raw equality the rule asks for is satisfied and the data is still wrong,
 * which is why this is refused up front rather than drawn and checked.
 *
 * Reported as the types it is, not as the options or bounds it also disturbs.
 * Those name lists and numbers a researcher can edit without ever reaching the
 * fault; the types name it exactly.
 */
function incompatibleGroupTypes(
  members: readonly ConstrainedVariable[],
): EmptyGroupBound[] {
  // Schema R2 requires same-typed reference targets; hand-built codebooks may bypass it.
  const kinds = new Set(members.map(({ entry }) => valueKind(entry.type)));
  if (kinds.size < 2) return [];

  const declared = members
    .map(({ entry }) => `"${entry.name}" (${entry.type})`)
    .join(' and ');

  return [
    {
      rules: ['type'],
      detail: `the types of ${declared} have no value in common`,
    },
  ];
}

/**
 * The picker resolutions a group's members cannot all write one string in.
 *
 * Every date resolution writes its own shape — `YYYY`, `YYYY-MM`, `YYYY-MM-DD`
 * — and `sameAs` asks for the identical string at both ends, so a month field
 * and a full-resolution field held equal have no value between them: the one
 * string drawn leaves either the month field holding `2026-07-20` or the full
 * field holding `2026-07`, neither of which its own control can display.
 *
 * This is the equality case, and it is not the comparator one. A comparison
 * across resolutions is enforceable and enforced — the runtime parses both ends
 * as instants, and `comparatorBound` writes each bound in the units of the end
 * it lands on. Equality alone demands the strings themselves match.
 *
 * A group that is not all datetime is a type conflict, reported as that by
 * `incompatibleGroupTypes`; resolutions are only what is wrong with a group
 * whose members agree on being dates.
 */
function incompatibleGroupResolutions(
  members: readonly ConstrainedVariable[],
): EmptyGroupBound[] {
  const dated = members.filter(({ entry }) => entry.type === 'datetime');
  if (dated.length !== members.length) return [];

  const resolutions = dated.map(
    ({ constraints }) => constraints.dateWindow?.resolution,
  );
  if (new Set(resolutions).size < 2) return [];

  const declared = dated
    .map(({ entry }, index) => `"${entry.name}" (${resolutions[index]})`)
    .join(' and ');

  return [
    {
      rules: ['parameters'],
      detail: `the date resolutions of ${declared} have no value in common`,
    },
  ];
}

/** What a member offers, as the researcher reads it: `"Rating A" (1, 2)`. */
function offeredBy(member: ConstrainedVariable): string {
  const values = (optionDomain(member) ?? [])
    .map((option) => String(option.value))
    .join(', ');

  return `"${member.entry.name}" (${values === '' ? 'none' : values})`;
}

/**
 * The options a group's members leave it nothing to choose from, or too little.
 *
 * Two members that offer no option value in common describe a field neither can
 * show the other's answer in, and the rule holding them equal has no solution
 * at all. Members that overlap in fewer options than the group's `minSelected`
 * asks for are the same fact one step along: the selection cannot be made from
 * what is left, however many options either member offers on its own.
 *
 * Both need two members with options of their own to be about the group rather
 * than about one variable. With one, the values left are that variable's own
 * and the per-variable checks already have whatever there is to say.
 */
function emptyGroupOptions(
  members: readonly ConstrainedVariable[],
  intersected: VariableConstraints,
): EmptyGroupBound[] {
  const offering = members.filter(
    (member) => optionDomain(member) !== undefined,
  );
  const shared = sharedOptionValues(offering);
  if (offering.length < 2 || shared === undefined) return [];

  const offered = offering.map(offeredBy).join(' and by ');

  if (shared.size === 0) {
    return [
      {
        rules: ['options'],
        detail: `the options offered by ${offered} have no value in common`,
      },
    ];
  }

  const { minSelected } = intersected;
  if (minSelected === undefined || minSelected <= shared.size) return [];

  const memberFallsShort = offering.some(({ entry, constraints }) => {
    const own = entry.options?.length ?? 0;
    return (
      constraints.minSelected !== undefined &&
      own > 0 &&
      constraints.minSelected > own
    );
  });

  return [
    {
      rules: ['minSelected', 'options'],
      detail: `minSelected ${minSelected} exceeds the ${shared.size} option${
        shared.size === 1 ? '' : 's'
      } shared by ${offered}${memberFallsShort ? ALSO_DECLARED : ''}`,
    },
  ];
}

/**
 * The bounds a group's intersected rules leave nothing between.
 *
 * A group holds one value for all of its members, so that value has to satisfy
 * every member's bounds at once. `sameAs`, and a cycle of non-strict
 * comparators, can merge members whose own ranges are each satisfiable into a
 * group whose intersection is empty — `[1, 5]` held equal to `[?, 0]` describes
 * a value that is both at least 1 and at most 0. An option list is a bound of
 * the same kind, and crosses the same way; so is the members' type, which
 * settles which values exist to be bounded at all, and — among dates — the
 * resolution their pickers write those values in.
 *
 * A bound pair one member's own declaration already crosses is reported too,
 * worded so it reads as the separate thing it is. The per-variable check names
 * only that member, and correcting what it names need not leave the group
 * satisfiable — `minLength 10`/`maxLength 2` held equal to `maxLength 4` still
 * has nothing between 10 and 4 once the member's own pair is put right. Leaving
 * it out costs a researcher a second round trip to find that out.
 */
export function emptyGroupBounds(
  members: readonly ConstrainedVariable[],
  intersected: VariableConstraints,
): EmptyGroupBound[] {
  const empty: EmptyGroupBound[] = [
    ...incompatibleGroupTypes(members),
    ...incompatibleGroupResolutions(members),
  ];

  for (const { min, max } of INTERSECTED_BOUNDS) {
    const floor = intersected[min];
    const ceiling = intersected[max];
    if (floor === undefined || ceiling === undefined || floor <= ceiling) {
      continue;
    }

    const memberCrosses = members.some(({ constraints }) => {
      const ownFloor = constraints[min];
      const ownCeiling = constraints[max];
      return (
        ownFloor !== undefined &&
        ownCeiling !== undefined &&
        ownFloor > ownCeiling
      );
    });

    empty.push({
      rules: [min, max],
      detail: `${min} ${floor} exceeds ${max} ${ceiling}${
        memberCrosses ? ALSO_DECLARED : ''
      }`,
    });
  }

  const window = intersected.dateWindow;
  const windowCrosses =
    window?.min !== undefined &&
    window.max !== undefined &&
    window.min > window.max;
  const memberWindowCrosses = members.some(({ constraints }) => {
    const own = constraints.dateWindow;
    return own?.min !== undefined && own.max !== undefined && own.min > own.max;
  });

  if (windowCrosses) {
    empty.push({
      rules: ['parameters'],
      detail: `the date range ${window.min} to ${window.max} is empty${
        memberWindowCrosses ? ALSO_DECLARED : ''
      }`,
    });
  }

  empty.push(...emptyGroupOptions(members, intersected));

  return empty;
}

/**
 * The gap a strict comparator must leave, in the units this variable is drawn
 * in — read from the values its own draw can produce rather than from its type.
 *
 * A number is drawn whole wherever its range holds a whole value, and one unit
 * is then the closest two of its values come. Where its range holds none the
 * draw falls back to the same decimal grid a scalar is drawn on, and a whole
 * unit is far wider than anything that range can separate: `[0.1, 0.2]` and
 * `[0.3, 0.4]` under `>` are satisfied by every pair of values either range
 * holds, and stepping a whole unit between them empties the upper one and
 * refuses the protocol. That is why the step comes from
 * {@link decimalGridStep}, which is what the draw itself walks — including the
 * two ends of a range holding no grid multiple at all, which is all such a
 * range has.
 *
 * Only the types a comparison can be declared on reach this. Anything else has
 * no bound for a comparison to step and never asks.
 */
export function comparatorGap(variable: ConstrainedVariable): number {
  const { entry, constraints } = variable;
  if (entry.type === 'scalar') {
    return decimalGridStep(scalarDrawGrid(constraints));
  }
  if (entry.type !== 'number') return 1;

  const { min, max } = numberDrawBounds(constraints);
  if (Math.floor(max) - Math.ceil(min) + 1 > 0) return 1;
  return decimalGridStep(decimalGrid(min, max));
}

/**
 * How much precision a stepped bound keeps. Far finer than any grid this
 * analysis reasons in, so a bound genuinely off the grid keeps its own value,
 * and coarse enough to erase what binary floating point leaves behind.
 */
const BOUND_DECIMAL_PLACES = 10;

/**
 * A numeric bound `steps` gaps from `base`.
 *
 * Adding a gap in binary floating point lands a hair beside the value the
 * decimal arithmetic names — `0.1 + 0.01` is `0.11000000000000001` — and a
 * bound carrying that noise is one no draw sits exactly on. The draw clamps up
 * to it instead, writing the noise into the network, and a `unique` slot then
 * spends a value on something the count never described. Rounded back to a
 * precision no bound this analysis handles can need, so a bound the protocol
 * declared off the grid is left where it was declared.
 */
export function steppedNumericBound(
  base: number,
  steps: number,
  gap: number,
): number {
  return Number((base + steps * gap).toFixed(BOUND_DECIMAL_PLACES));
}

/** A date string rewritten at `resolution`, dropping or defaulting components. */
function atResolution(value: string, resolution: DateResolution): string {
  const [year = '0000', month = '01', day = '01'] = value.split('-');
  if (resolution === 'year') return year;
  if (resolution === 'month') return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/**
 * What a comparison against one date leaves the other end: a bound that end
 * must respect, or the statement that no date its picker can hold satisfies the
 * comparison at all.
 */
export type ComparatorDateBound =
  | { kind: 'bound'; value: string }
  | { kind: 'empty' };

/**
 * The bound a comparison against one date puts on the other end, written at
 * that end's own resolution.
 *
 * The runtime compares dates by parsing both ends with `new Date(...)`, and
 * ECMAScript reads a date-only string as UTC midnight beginning the period it
 * names: `2010-12` is the same instant as `2010-12-01`, and `2010` the same as
 * `2010-01-01`. Two dates written at different resolutions therefore do compare
 * — the coarser one simply sits at the start of its period — so a comparison
 * across resolutions is a rule the runtime enforces and one generation has to
 * satisfy rather than skip.
 *
 * Rewriting `target` at `resolution` can only move it earlier, onto the start
 * of the period containing it, and only when `resolution` is the coarser of the
 * two. Where it moves at all the two ends no longer coincide, and that decides
 * the step: a floor has to clear the whole period whether or not the comparison
 * is strict, because `2009-06` does not reach `2009-06-17`; a ceiling already
 * clears it, and steps back only when the two do coincide and the comparison is
 * strict.
 *
 * A step that would leave the calendar leaves no bound at all: it says the
 * comparison is empty, and it says so rather than being clamped back onto the
 * last date the picker offers. Clamping is what a *window* derived from an
 * offset wants — `offsetWithinOfferedDates` — because a window still has
 * to name somewhere for a value to sit. Here the step is exactly what the rule
 * excludes, so holding a strict floor at `9999-12-31` would readmit the one
 * date the rule refuses. Nor can the overflow be caught downstream: `addSteps`
 * writes it as `10000-01-01`, whose leading digit sorts it *below* every
 * four-digit year, so `tighten` reads it as the looser bound and drops it and
 * the draw then emits a date the comparison forbids.
 */
export function comparatorBound(
  target: string,
  resolution: DateResolution,
  { boundsUpper, strict }: { boundsUpper: boolean; strict: boolean },
): ComparatorDateBound | undefined {
  if (dateValueResolution(target) === undefined) return undefined;

  const here = atResolution(target, resolution);
  const coincides = atResolution(here, 'full') === atResolution(target, 'full');
  const stepsAway = boundsUpper ? strict || !coincides : strict && coincides;
  if (!stepsAway) return { kind: 'bound', value: here };

  const leavesCalendar = boundsUpper
    ? here >= LATEST_OFFERED_DATE[resolution]
    : here <= EARLIEST_OFFERED_DATE[resolution];
  if (leavesCalendar) return { kind: 'empty' };

  return {
    kind: 'bound',
    value: addSteps(here, boundsUpper ? 1 : -1, resolution),
  };
}

/**
 * Which groups each group's value must differ from.
 *
 * `differentFrom` binds both of its ends, so the pair is recorded from both:
 * the ordering pass keeps one dependency edge per pair and drops it entirely
 * when it would close a cycle, which leaves the group that declared the rule as
 * likely to be drawn first as the group it names.
 */
export function differentFromGroups(
  entity: EntityConstraints,
  groupOf: Map<string, string>,
): Map<string, Set<string>> {
  const excluded = new Map<string, Set<string>>();

  const link = (from: string, to: string): void => {
    const targets = excluded.get(from) ?? new Set<string>();
    targets.add(to);
    excluded.set(from, targets);
  };

  for (const [id, variable] of entity) {
    const targetId = variable.constraints.differentFrom;
    if (targetId === undefined || !entity.has(targetId)) continue;

    const group = groupOf.get(id) ?? id;
    const target = groupOf.get(targetId) ?? targetId;
    // One group holds a single value, which cannot differ from itself;
    // `resolveGenerationOrder` reports that as a contradiction.
    if (group === target) continue;

    link(group, target);
    link(target, group);
  }

  return excluded;
}

/**
 * Every comparator in the entity, rewritten as an ordering between the groups
 * that hold the two values. Both ends of an edge inside one group are the same
 * value, so nothing is left to order — a strict comparator of that shape is a
 * contradiction `resolveGenerationOrder` already reports.
 */
export function groupComparatorEdges(
  entity: EntityConstraints,
  groupOf: Map<string, string>,
): ComparatorEdge[] {
  const edges: ComparatorEdge[] = [];
  const seen = new Set<string>();

  for (const edge of canonicalComparatorEdges(entity)) {
    const lower = groupOf.get(edge.lower) ?? edge.lower;
    const upper = groupOf.get(edge.upper) ?? edge.upper;
    if (lower === upper) continue;

    const key = [lower, upper, String(edge.strict)].join(KEY_SEPARATOR);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ lower, upper, strict: edge.strict });
  }

  return edges;
}

/** A group's bounds while propagation is narrowing them. */
type Range = {
  minValue: number | undefined;
  maxValue: number | undefined;
  windowMin: string | undefined;
  windowMax: string | undefined;
};

/**
 * How far apart a strict comparator provably holds its two ends: the finer of
 * the two ends' granularities, or one unit at each date window's own
 * resolution.
 *
 * The two date resolutions are carried separately because a bound crossing
 * between them is rewritten into the units of the end it lands on, which
 * `comparatorBound` does.
 */
export type Span =
  | { kind: 'numeric'; gap: number }
  | { kind: 'date'; lower: DateResolution; upper: DateResolution };

function isNumeric(variable: ConstrainedVariable): boolean {
  return variable.entry.type === 'number' || variable.entry.type === 'scalar';
}

/**
 * A comparison holding a number against a date, which no assignment of the two
 * can be judged to satisfy.
 *
 * The runtime's `compareVariables` is handed the declaring variable's own type.
 * From the numeric end that is `number` or `scalar`, so it coerces both sides
 * with `Number(...)` and a `'2006-01-14'` becomes `NaN`; nothing further in
 * that function compares a number against a string, and it returns 0. Every
 * strict comparison then fails whatever the two values are — `72` is reported
 * as neither greater than nor less than `2006-01-14` — and every non-strict one
 * passes whatever they are. From the date end `new Date(...)` reads the number
 * as milliseconds since the epoch, so a modern date outranks any plausible
 * count and the comparison is decided by that accident rather than by the rule.
 *
 * There is no value for generation to aim at in any of those readings, so the
 * pair is refused rather than dropped: dropping it leaves the numeric end drawn
 * from its own range alone, and the interview then rejects every strict rule it
 * is handed. Refused in both directions and at both strictnesses, because a
 * pairing that only reports under `>` would be "fixed" by writing `>=`, which
 * silences the message without making the rule mean anything.
 *
 * `ordinal` is deliberately not swept in alongside `number` and `scalar`:
 * propagation carries no comparator of any kind for an ordinal, so refusing
 * that pairing here would be a rule about a machinery that is not yet there.
 */
function incomparableEnds(
  lower: ConstrainedVariable,
  upper: ConstrainedVariable,
): boolean {
  return (
    (isNumeric(lower) && upper.entry.type === 'datetime') ||
    (isNumeric(upper) && lower.entry.type === 'datetime')
  );
}

/**
 * Comparisons the generator cannot step across — a number against a date, or
 * either end carrying no window to step within — leave nothing to propagate.
 * A number against a date leaves nothing to satisfy either, and is refused by
 * `incomparableEnds` rather than merely passed over.
 *
 * Two dates written at different resolutions are not among them: the runtime
 * compares those as instants, so the comparison is real and propagating it is
 * a matter of writing each bound in the units of the end it constrains.
 *
 * The numeric gap is the finer of the two ends' granularities, each read from
 * what that end's own draw can produce — see {@link comparatorGap}. Stepping by
 * the coarser end's unit instead over-tightens: a scalar strictly below a
 * number pinned to 1 still reaches 0.99, not 0, and a number in `[0.3, 0.4]`
 * strictly above one in `[0.1, 0.2]` has its whole range to draw from rather
 * than none of it. An over-tight bound turns satisfiable protocols into
 * refusals.
 */
export function comparatorSpan(
  lower: ConstrainedVariable,
  upper: ConstrainedVariable,
): Span | undefined {
  if (isNumeric(lower) && isNumeric(upper)) {
    return {
      kind: 'numeric',
      gap: Math.min(comparatorGap(lower), comparatorGap(upper)),
    };
  }

  if (lower.entry.type !== 'datetime' || upper.entry.type !== 'datetime') {
    return undefined;
  }

  const upperResolution = upper.constraints.dateWindow?.resolution;
  const lowerResolution = lower.constraints.dateWindow?.resolution;
  if (upperResolution === undefined || lowerResolution === undefined) {
    return undefined;
  }

  return { kind: 'date', lower: lowerResolution, upper: upperResolution };
}

function isInverted({
  minValue,
  maxValue,
  windowMin,
  windowMax,
}: Range): boolean {
  return (
    (minValue !== undefined && maxValue !== undefined && minValue > maxValue) ||
    (windowMin !== undefined &&
      windowMax !== undefined &&
      windowMin > windowMax)
  );
}

function withRange(
  constraints: VariableConstraints,
  { minValue, maxValue, windowMin, windowMax }: Range,
): VariableConstraints {
  const window = constraints.dateWindow;

  return {
    ...constraints,
    ...(minValue !== undefined ? { minValue } : {}),
    ...(maxValue !== undefined ? { maxValue } : {}),
    ...(window !== undefined
      ? {
          dateWindow: {
            resolution: window.resolution,
            ...(windowMin !== undefined ? { min: windowMin } : {}),
            ...(windowMax !== undefined ? { max: windowMax } : {}),
            // A comparator that moved the ceiling produced a bound of its own,
            // which is a rule; an untouched ceiling is still whatever it was.
            ...(window.maxDerived === true && windowMax === window.max
              ? { maxDerived: true }
              : {}),
          },
        }
      : {}),
  };
}

type PropagatedBounds = {
  /** Each group's rules, narrowed by every comparator that bounds it. */
  groups: Map<string, ConstrainedVariable>;
  /**
   * Groups whose comparators no assignment satisfies: the ones propagation
   * itself emptied, because the comparators around them are what their range
   * could not hold; the ones a strict comparison sent off the end of the
   * calendar, where the bound it needs is not a date at all; and the ends of a
   * comparison between a number and a date, which has no satisfying assignment
   * at any range. A group whose range was
   * already empty when propagation started is left out, because that is either
   * one variable's own bounds crossing or a group's members' bounds failing to
   * overlap — both of which the feasibility pass reports without propagating
   * anything.
   */
  inverted: Set<string>;
  /**
   * The subset of {@link inverted} reported for the types at a comparison's
   * ends rather than for any range: a number against a date has no satisfying
   * assignment at bounds of any width, so a message about bounds would name the
   * wrong fault.
   */
  incomparable: Set<string>;
};

/**
 * Every group's bounds narrowed by the whole system of comparators, rather than
 * by each comparison on its own.
 *
 * Folding a comparison into a bound one pair at a time cannot see a chain: `a`,
 * `b` and `c` each declared `[0, 1]` with `a < b < c` leaves every pair
 * satisfiable while the three together are not. Two walks over the group graph
 * settle the whole system at once:
 *
 * - forwards, in generation order, each edge raises its upper end's floor to
 *   the lower end's floor plus the step a strict comparison needs;
 * - backwards, in reverse, each edge lowers its lower end's ceiling by that
 *   same step below the upper end's ceiling.
 *
 * One walk each way is the fixpoint, not a first approximation. Floors are only
 * ever read from earlier groups and ceilings only from later ones, so neither
 * walk can invalidate what it has already settled, and the two never read each
 * other. That rests on generation order being a topological order of the
 * comparator graph, which `resolveGenerationOrder` guarantees whenever it
 * reports no cycles; an edge that contradicts the order therefore belongs to a
 * cycle it has already reported, and is dropped rather than looped over.
 *
 * A group whose bounds cross over keeps its own declared range: the feasibility
 * pass refuses such a protocol, and until it does the generator draws inside
 * the bounds a participant's form would enforce rather than outside them.
 */
export function propagateComparatorBounds(
  groups: Map<string, ConstrainedVariable>,
  order: readonly string[],
  edges: readonly ComparatorEdge[],
): PropagatedBounds {
  const position = new Map(order.map((group, index) => [group, index]));
  const at = (group: string): number => position.get(group) ?? 0;

  const ranges = new Map<string, Range>();
  const declaredInverted = new Set<string>();
  const inverted = new Set<string>();
  const incomparable = new Set<string>();
  // Groups a comparison put outside the calendar. The overflow cannot be seen
  // in the range afterwards — a bound past year 9999 sorts below every date it
  // was meant to exclude — so it is recorded where it happens.
  const emptied = new Set<string>();

  for (const [group, { constraints }] of groups) {
    const range: Range = {
      minValue: constraints.minValue,
      maxValue: constraints.maxValue,
      windowMin: constraints.dateWindow?.min,
      windowMax: constraints.dateWindow?.max,
    };
    ranges.set(group, range);
    if (isInverted(range)) declaredInverted.add(group);
  }

  const ordered = edges.filter(
    (edge) =>
      position.has(edge.lower) &&
      position.has(edge.upper) &&
      at(edge.lower) < at(edge.upper),
  );

  // Refused before either walk, so the walks are only ever asked to narrow
  // bounds a value could sit inside. Both ends are named: the rule is written
  // on one of them and is about the pair.
  for (const edge of ordered) {
    const lower = groups.get(edge.lower);
    const upper = groups.get(edge.upper);
    if (!lower || !upper || !incomparableEnds(lower, upper)) continue;
    for (const end of [edge.lower, edge.upper]) {
      inverted.add(end);
      incomparable.add(end);
    }
  }

  for (const edge of ordered.toSorted((a, b) => at(a.lower) - at(b.lower))) {
    const lower = groups.get(edge.lower);
    const upper = groups.get(edge.upper);
    const from = ranges.get(edge.lower);
    const into = ranges.get(edge.upper);
    if (!lower || !upper || !from || !into) continue;

    const span = comparatorSpan(lower, upper);
    const steps = edge.strict ? 1 : 0;

    if (span?.kind === 'numeric' && from.minValue !== undefined) {
      into.minValue = tighten(
        into.minValue,
        steppedNumericBound(from.minValue, steps, span.gap),
        true,
      );
    } else if (span?.kind === 'date' && from.windowMin !== undefined) {
      const bound = comparatorBound(from.windowMin, span.upper, {
        boundsUpper: true,
        strict: edge.strict,
      });
      if (bound?.kind === 'empty') emptied.add(edge.upper);
      else if (bound !== undefined) {
        into.windowMin = tighten(into.windowMin, bound.value, true);
      }
    }
  }

  for (const edge of ordered.toSorted((a, b) => at(b.upper) - at(a.upper))) {
    const lower = groups.get(edge.lower);
    const upper = groups.get(edge.upper);
    const from = ranges.get(edge.upper);
    const into = ranges.get(edge.lower);
    if (!lower || !upper || !from || !into) continue;

    const span = comparatorSpan(lower, upper);
    const steps = edge.strict ? 1 : 0;

    if (span?.kind === 'numeric' && from.maxValue !== undefined) {
      into.maxValue = tighten(
        into.maxValue,
        steppedNumericBound(from.maxValue, -steps, span.gap),
        false,
      );
    } else if (span?.kind === 'date' && from.windowMax !== undefined) {
      const bound = comparatorBound(from.windowMax, span.lower, {
        boundsUpper: false,
        strict: edge.strict,
      });
      if (bound?.kind === 'empty') emptied.add(edge.lower);
      else if (bound !== undefined) {
        into.windowMax = tighten(into.windowMax, bound.value, false);
      }
    }
  }

  const propagated = new Map<string, ConstrainedVariable>();

  for (const [group, variable] of groups) {
    const range = ranges.get(group);

    if (range === undefined || emptied.has(group) || isInverted(range)) {
      if (range !== undefined && !declaredInverted.has(group)) {
        inverted.add(group);
      }
      propagated.set(group, variable);
      continue;
    }

    propagated.set(group, {
      entry: variable.entry,
      constraints: withRange(variable.constraints, range),
    });
  }

  return { groups: propagated, inverted, incomparable };
}
