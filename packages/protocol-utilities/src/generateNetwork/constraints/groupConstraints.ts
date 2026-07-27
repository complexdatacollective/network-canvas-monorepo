import type {
  ConstrainedVariable,
  EntityConstraints,
  VariableConstraints,
} from './types';

/**
 * Keeps whichever of two bounds is tighter. Dates are compared as strings,
 * which orders them correctly as long as both are written at the same
 * resolution — every caller here checks that first.
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
 * The rules the single value shared by a `sameAs` group must satisfy: the
 * tightest of every member's bounds rather than any one member's. A member
 * capped at `maxLength: 24` joined to one requiring `minLength: 24` needs a
 * value of exactly 24 characters, which neither member alone would produce.
 *
 * The representative supplies the type and options, since a `sameAs` between
 * variables of different types has no meaning the runtime could check.
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
    // only a window matching the representative's resolution contributes.
    const window = constraints.dateWindow;
    if (window !== undefined && window.resolution === resolution) {
      windowMin = tighten(windowMin, window.min, true);
      windowMax = tighten(windowMax, window.max, false);
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
      entry: representative.entry,
      constraints: intersectConstraints(members, representative),
    });
  }

  return groups;
}
