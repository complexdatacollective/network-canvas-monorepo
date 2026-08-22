import type { ResolvedVariableSynthetic } from '@codaco/protocol-validation';

import { invariant } from '../utils/invariant';
import {
  daysToSteps,
  type DateResolution,
  offsetWithinOfferedDates,
  openDateFloor,
  truncateToResolution,
} from './dateWindow';
import type { ConstrainedVariable } from './types';

/**
 * A variable's resolved descriptor, read at the type the variable is.
 *
 * The descriptor is discriminated by that type, and the two are resolved
 * together — `buildEntityConstraints` derives one from the other — so a
 * mismatch is not a case to handle but an engine that has stopped keeping its
 * own invariant. Stated as an assertion for the same reason `invariant` exists
 * at all: it narrows the union without a cast, and a violation names the
 * variable instead of surfacing as a missing field several draws later.
 */
export function descriptorOf<T extends ResolvedVariableSynthetic['type']>(
  variable: ConstrainedVariable,
  type: T,
): Extract<ResolvedVariableSynthetic, { type: T }> {
  const { descriptor } = variable;
  invariant(
    descriptor !== undefined && descriptor.type === type,
    `"${variable.entry.name}" is a ${variable.entry.type} variable with no resolved ${type} descriptor`,
  );
  // `descriptor.type === type` narrows against a generic literal only as far as
  // the union itself; the assertion above is what makes this sound.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return descriptor as Extract<ResolvedVariableSynthetic, { type: T }>;
}

/**
 * The window a number descriptor names, with each side left open where the
 * distribution names none.
 *
 * A constant is its own window: every draw is that value, so it is both ends.
 * An open-tailed family closes only the ends the author chose to close, which
 * is the carve-out the schema already makes for it — validation TRUNCATES such
 * a draw rather than bounding its support.
 */
export function numberDescriptorWindow(
  descriptor: Extract<ResolvedVariableSynthetic, { type: 'number' }>,
): { min: number | undefined; max: number | undefined } {
  if (descriptor.distribution === 'constant') {
    return { min: descriptor.value, max: descriptor.value };
  }
  return { min: descriptor.min, max: descriptor.max };
}

/**
 * How far back an unbounded `unique` date may reach, in steps at the window's
 * own resolution.
 *
 * Bounded by the calendar rather than by entity count: no span wider than a
 * thousand years stays a real date at year resolution, so a year-resolution
 * space is narrower than a numeric one by necessity.
 *
 * Not part of any descriptor, and deliberately: a `unique` slot meets
 * distinctness by walking a SEQUENCE of values rather than by drawing from the
 * shape its descriptor names, so this sizes that walk rather than what a value
 * looks like. The same reasoning keeps `UNIQUE_NUMBER_HEADROOM` beside the
 * count it feeds.
 */
function uniqueDateReach(resolution: DateResolution): number {
  const years = 1000;
  if (resolution === 'year') return years;
  if (resolution === 'month') return years * 12;
  return Math.round(years * 365.25);
}

/**
 * The earliest date a datetime is drawn from, where the field itself leaves
 * that end open.
 *
 * Read by the draw and by the value-space count, which have to describe the
 * same window or feasibility is spending values the generator cannot reach.
 * The order is the order of authority:
 *
 * 1. A floor the AUTHOR named on the descriptor. Only an author ever sets
 *    `min` — resolution never does — so this is the declaration winning.
 * 2. For a `unique` variable, {@link uniqueDateReach}: it is walking a
 *    sequence, not drawing, and needs a date per entity.
 * 3. The relative window resolution derived, reaching back from its anchor.
 *
 * With no anchor declared, that anchor is the latest date the FIELD offers —
 * which is the date the session runs on wherever the protocol does not name an
 * earlier ceiling. Reaching back from the session date regardless would leave a
 * field that stops collecting in 1990 with a window a decade after its own
 * ceiling, and so with nothing to draw at all.
 */
export function openDatetimeFloor(
  variable: ConstrainedVariable,
  ceiling: string,
  resolution: DateResolution,
): string {
  const descriptor = descriptorOf(variable, 'datetime');
  if (descriptor.min !== undefined) {
    return truncateToResolution(descriptor.min, resolution);
  }
  if (variable.constraints.unique) {
    return openDateFloor(ceiling, uniqueDateReach(resolution), resolution);
  }
  const { relative } = descriptor;
  invariant(
    relative !== undefined,
    `"${variable.entry.name}" collects dates with no earliest date of its own, and its descriptor resolved no window to reach back over`,
  );
  const anchor =
    relative.anchor === undefined
      ? ceiling
      : truncateToResolution(relative.anchor, resolution);
  return openDateFloor(
    anchor,
    daysToSteps(relative.before, resolution),
    resolution,
  );
}

/**
 * The latest date a datetime is drawn from, where the field leaves that end
 * open. Only a hand-built constraint descriptor reaches this — every window
 * `buildVariableConstraints` produces closes its ceiling — so `sessionDate` is
 * the only date left to close it with.
 */
export function openDatetimeCeiling(
  variable: ConstrainedVariable,
  sessionDate: string,
  resolution: DateResolution,
): string {
  const descriptor = descriptorOf(variable, 'datetime');
  if (descriptor.max !== undefined) {
    return truncateToResolution(descriptor.max, resolution);
  }
  const { relative } = descriptor;
  if (relative === undefined)
    return truncateToResolution(sessionDate, resolution);
  const anchor =
    relative.anchor === undefined
      ? truncateToResolution(sessionDate, resolution)
      : truncateToResolution(relative.anchor, resolution);
  return offsetWithinOfferedDates(
    anchor,
    daysToSteps(relative.after, resolution),
    resolution,
  );
}

/**
 * The ends the descriptor's own RELATIVE window closes, or `undefined` where it
 * declares none.
 *
 * Separate from {@link openDatetimeFloor} and {@link openDatetimeCeiling},
 * which answer "what closes this end when the field leaves it open". These
 * answer "what does the descriptor say about this end", which is a different
 * question and the one an INTERSECTION needs: a field that closes an end and a
 * descriptor that narrows it are both speaking, and the tighter wins.
 *
 * Reading the descriptor only where the field left a gap is what let a declared
 * "the last ten years" be replaced wholesale by a field collecting back to
 * 1990 — a declaration widened rather than narrowed, which is the one thing
 * validation bounding a descriptor must never do.
 */
export function relativeDatetimeCeiling(
  variable: ConstrainedVariable,
  sessionDate: string,
  resolution: DateResolution,
): string | undefined {
  const { relative } = descriptorOf(variable, 'datetime');
  if (relative === undefined) return undefined;
  const anchor =
    relative.anchor === undefined
      ? truncateToResolution(sessionDate, resolution)
      : truncateToResolution(relative.anchor, resolution);
  return offsetWithinOfferedDates(
    anchor,
    daysToSteps(relative.after, resolution),
    resolution,
  );
}

export function relativeDatetimeFloor(
  variable: ConstrainedVariable,
  ceiling: string,
  resolution: DateResolution,
): string | undefined {
  const { relative } = descriptorOf(variable, 'datetime');
  if (relative === undefined) return undefined;
  const anchor =
    relative.anchor === undefined
      ? ceiling
      : truncateToResolution(relative.anchor, resolution);
  return openDateFloor(
    anchor,
    daysToSteps(relative.before, resolution),
    resolution,
  );
}
