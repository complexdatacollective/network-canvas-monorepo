import { useEffect, useState } from 'react';

import type { SyntheticWindow } from './summaries';

/**
 * The typing behaviour every numeric generation parameter shares.
 *
 * A number typed a digit at a time passes through states nobody means — an
 * empty box, a lone minus, a trailing decimal point — so the box keeps the
 * researcher's TEXT while the parameter keeps a number. An entry the window
 * admits is committed as it is typed; one it does not is never committed; blur
 * re-synchronises the box with the value that was, which is what makes a
 * refusal visible (spec governing rule 2).
 *
 * Refusal rather than clamping, because a window may be open or exclusive on
 * the offending side: a beta's mean lives strictly between 0 and 1, and
 * clamping 1.4 to 1 would hand back a number the schema refuses just as firmly
 * as the one that was typed.
 */

/**
 * A numeric field's window, exactly as its schema states it.
 *
 * `min`/`max` are absent where the schema leaves that side open, and the
 * exclusivity flags carry the difference between `.min(0)` and `.gt(0)` — a
 * beta's mean lives strictly inside 0 and 1, and an input offering either
 * endpoint would offer a value the schema refuses.
 *
 * Defined beside the control it holds rather than beside any one of the
 * readings that produce it: the schema introspection the codebook editor uses
 * and the sibling-bound arithmetic the stage editor uses both answer this same
 * question, and the control must not be able to tell which of them asked.
 */
export type NumericWindow = {
  min?: number;
  max?: number;
  exclusiveMin: boolean;
  exclusiveMax: boolean;
  integer: boolean;
};

/**
 * A closed value window read as a control's window: an infinite endpoint is an
 * OPEN side, because an input cannot offer infinity and a spinner bounded by
 * it would be bounded by nothing.
 *
 * `integer` is the caller's claim about the field, not something a pair of
 * endpoints can say.
 */
export const numericWindowOf = (
  bounds: SyntheticWindow,
  integer = false,
): NumericWindow => ({
  ...(Number.isFinite(bounds.min) ? { min: bounds.min } : {}),
  ...(Number.isFinite(bounds.max) ? { max: bounds.max } : {}),
  exclusiveMin: false,
  exclusiveMax: false,
  integer,
});

type MinPart = Pick<NumericWindow, 'min' | 'exclusiveMin'>;
type MaxPart = Pick<NumericWindow, 'max' | 'exclusiveMax'>;

// Only the half each helper is about. Returning a whole window from either
// would let the second spread overwrite what the first decided — which is how
// a strict lower bound once came back inclusive, and a lognormal mean started
// at the zero its schema excludes.
const minPart = (window: MinPart): MinPart =>
  window.min === undefined
    ? { exclusiveMin: false }
    : { min: window.min, exclusiveMin: window.exclusiveMin };

const maxPart = (window: MaxPart): MaxPart =>
  window.max === undefined
    ? { exclusiveMax: false }
    : { max: window.max, exclusiveMax: window.exclusiveMax };

const tighterMin = (a: MinPart, b: MinPart): MinPart => {
  if (a.min === undefined) return minPart(b);
  if (b.min === undefined) return minPart(a);
  if (a.min > b.min) return minPart(a);
  if (b.min > a.min) return minPart(b);
  // Equal bounds: the exclusive reading is the tighter one.
  return { min: a.min, exclusiveMin: a.exclusiveMin || b.exclusiveMin };
};

const tighterMax = (a: MaxPart, b: MaxPart): MaxPart => {
  if (a.max === undefined) return maxPart(b);
  if (b.max === undefined) return maxPart(a);
  if (a.max < b.max) return maxPart(a);
  if (b.max < a.max) return maxPart(b);
  return { max: a.max, exclusiveMax: a.exclusiveMax || b.exclusiveMax };
};

/**
 * The window a value must satisfy BOTH of: each side taken from whichever
 * states it more tightly, and an open side left open only where neither
 * closes it.
 *
 * Wholeness is a claim about the quantity rather than about a bound, so it
 * survives from either side: a parameter the schema types as an integer stays
 * one however the other window is stated.
 */
export const narrowedWindow = (
  a: NumericWindow,
  b: NumericWindow,
): NumericWindow => ({
  ...tighterMin(a, b),
  ...tighterMax(a, b),
  integer: a.integer || b.integer,
});

/**
 * A value to put in a parameter that has just appeared, because the researcher
 * chose a distribution family — or a topology metric — that carries it.
 *
 * The middle of the window where it has one, so a bounded parameter starts
 * somewhere the whole range is reachable from; the open side's own bound
 * otherwise, stepped inside where the bound is exclusive. A parameter with no
 * window at all starts at zero, which every unbounded family accepts.
 */
export const seedParameterValue = (window: NumericWindow): number => {
  const { min, max, exclusiveMin, exclusiveMax, integer } = window;
  const round = (value: number) => (integer ? Math.round(value) : value);

  if (min !== undefined && max !== undefined) {
    const middle = round((min + max) / 2);
    if (middle > min && middle < max) return middle;
    if (!exclusiveMin && middle <= min) return min;
    if (!exclusiveMax && middle >= max) return max;
    return middle;
  }
  if (min !== undefined) return exclusiveMin ? round(min + 1) : min;
  if (max !== undefined) return exclusiveMax ? round(max - 1) : max;
  return 0;
};

export type NumericDraftOptions = {
  /** The committed value; `undefined` renders an empty box. */
  value: number | undefined;
  /** The window the value may take, as its schema states it. */
  window: NumericWindow;
  /** Whether clearing the box is a legal way to leave the value unstated. */
  clearable?: boolean;
  onCommit: (value: number | undefined) => void;
};

/** Whether a parsed entry is one the schema's window admits. */
export const withinWindow = (value: number, window: NumericWindow): boolean => {
  if (!Number.isFinite(value)) return false;
  if (window.integer && !Number.isInteger(value)) return false;
  if (window.min !== undefined) {
    if (window.exclusiveMin ? value <= window.min : value < window.min) {
      return false;
    }
  }
  if (window.max !== undefined) {
    if (window.exclusiveMax ? value >= window.max : value > window.max) {
      return false;
    }
  }
  return true;
};

const format = (value: number | undefined): string =>
  value === undefined ? '' : String(value);

/** 1, 2 or 5 times a power of ten: the sizes a person counts in. */
const niceStep = (size: number): number => {
  if (!Number.isFinite(size) || size <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(size));
  const leading = size / magnitude;
  const rounded = leading >= 5 ? 5 : leading >= 2 ? 2 : 1;
  return rounded * magnitude;
};

/** How many decimal places a number is written to, exponent form included. */
const decimalPlaces = (value: number): number => {
  const [mantissa = '', exponent] = String(value).toLowerCase().split('e');
  const written = mantissa.split('.')[1]?.length ?? 0;
  const shift = exponent === undefined ? 0 : Number(exponent);
  return Math.min(15, Math.max(0, written - shift));
};

/**
 * How far one press of a stepper moves a parameter.
 *
 * A window that closes on both sides has a SPAN to divide, so the step is a
 * twentieth of it — a probability moves in hundredths, not in whole units. An
 * open window has no span, so the step follows the value's own scale instead:
 * the place its leading digit is written in, so a standard deviation of 0.2
 * moves in tenths while a mean of 40 moves in ones.
 *
 * Never coarser than one whole unit, because every one of these parameters is
 * a quantity whose whole numbers a researcher means; and exactly one unit for
 * a parameter the schema types as an integer, where nothing finer is legal.
 */
export const stepSize = (
  window: NumericWindow,
  value: number | undefined,
): number => {
  if (window.integer) return 1;
  const { min, max } = window;
  if (min !== undefined && max !== undefined && max > min) {
    return Math.min(1, niceStep((max - min) / 20));
  }
  if (value === undefined || value === 0 || !Number.isFinite(value)) return 1;
  return Math.min(1, 10 ** Math.floor(Math.log10(Math.abs(value))));
};

/**
 * The endpoint a candidate outside the window can be brought back to, or
 * `undefined` where none can hold it: an exclusive bound names a value the
 * schema refuses, so there is nothing on that side to clamp to.
 */
const admissibleBound = (
  candidate: number,
  window: NumericWindow,
): number | undefined => {
  const { min, max, exclusiveMin, exclusiveMax, integer } = window;
  if (min !== undefined && candidate < min) {
    if (exclusiveMin) return undefined;
    return integer ? Math.ceil(min) : min;
  }
  if (max !== undefined && candidate > max) {
    if (exclusiveMax) return undefined;
    return integer ? Math.floor(max) : max;
  }
  return undefined;
};

/**
 * The value one press of a stepper settles on, or `undefined` where the press
 * moves nothing.
 *
 * Stepping is the same offer typing is: a value the window admits, or nothing
 * at all. A step that would leave the window is brought back to the endpoint
 * where the window closes inclusively, and is refused outright where it does
 * not — a beta's mean lives strictly inside 0 and 1, so a step down from the
 * smallest value it holds has nowhere to land and stays put (spec governing
 * rule 2: a value the schema would refuse must not be enterable).
 *
 * Its own arithmetic rather than the input's native `stepUp`, which cannot
 * express any of this: it throws outright on the `step="any"` a continuous
 * parameter declares, reads an exclusive bound as an inclusive one, and snaps
 * to a grid the schema never stated.
 */
export const steppedValue = (
  value: number | undefined,
  direction: 'up' | 'down',
  window: NumericWindow,
): number | undefined => {
  // A press on an empty box has to count from somewhere. The natural zero
  // where the window holds one, so the first press moves one step away from
  // nothing — an option weight whose ceiling is a million must not open at
  // half of it — and the value the window starts at where it does not, because
  // a beta's mean has no zero to count from. Where the step from there has
  // nowhere to go, the starting point itself is what the press writes: putting
  // a number into an empty box is a change even when it does not move.
  if (value === undefined || !Number.isFinite(value)) {
    const start = withinWindow(0, window) ? 0 : seedParameterValue(window);
    if (!withinWindow(start, window)) return undefined;
    return steppedValue(start, direction, window) ?? start;
  }

  const up = direction === 'up';
  const step = stepSize(window, value);
  // An integral window steps between whole numbers even when what is in the
  // box is not one, so the step lands inside the window rather than carrying
  // the fraction that put it outside.
  const from = window.integer
    ? up
      ? Math.floor(value)
      : Math.ceil(value)
    : value;
  const raw = up ? from + step : from - step;
  // Binary floating point turns 0.2 + 0.1 into 0.30000000000000004; the box
  // must show what the researcher would have typed.
  const places = Math.max(decimalPlaces(step), decimalPlaces(from));
  const candidate = Number(raw.toFixed(places));

  if (withinWindow(candidate, window)) return candidate;
  const bound = admissibleBound(candidate, window);
  if (bound === undefined || bound === value || !withinWindow(bound, window)) {
    return undefined;
  }
  return bound;
};

/**
 * The bounds and step a numeric `<input>` should carry, so its spinner and its
 * browser-native validity describe the same window the commit guard enforces.
 * An open side contributes no attribute rather than an unusable one, and a
 * continuous parameter declares `step="any"` because any value inside its
 * window is one the schema takes.
 *
 * `resolveStep` is what keeps the steppers working under that declaration:
 * `InputField` disables them for a native step of `any` (whose `stepUp()`
 * throws), so the arithmetic above is handed over instead — stepping is then
 * offered wherever typing is.
 */
const numericInputAttributes = (
  window: NumericWindow,
  value: number | undefined,
) => ({
  type: 'number' as const,
  ...(window.min === undefined ? {} : { min: window.min }),
  ...(window.max === undefined ? {} : { max: window.max }),
  step: window.integer ? 1 : ('any' as const),
  resolveStep: (current: string, direction: 'up' | 'down') => {
    // Whatever is in the box, where that is a number: a stepper pressed after
    // typing carries on from what was typed, refused entry included.
    const typed = current.trim() === '' ? Number.NaN : Number(current);
    const from = Number.isFinite(typed) ? typed : value;
    const next = steppedValue(from, direction, window);
    return next === undefined ? undefined : String(next);
  },
});

export const useNumericDraft = ({
  value,
  window,
  clearable = false,
  onCommit,
}: NumericDraftOptions) => {
  const [text, setText] = useState(() => format(value));

  // A value that changes underneath the box — a reset, a family switch, an
  // undo — replaces what is in it. A value that does not change leaves the
  // researcher's own text alone, so a refused entry stays visible until blur.
  useEffect(() => {
    setText(format(value));
  }, [value]);

  const onChange = (next: string | undefined) => {
    const raw = next ?? '';
    setText(raw);
    if (raw.trim() === '') {
      if (clearable) onCommit(undefined);
      return;
    }
    const parsed = Number(raw);
    if (!withinWindow(parsed, window)) return;
    onCommit(parsed);
  };

  return {
    text,
    onChange,
    onBlur: () => setText(format(value)),
    inputAttributes: numericInputAttributes(window, value),
  };
};
