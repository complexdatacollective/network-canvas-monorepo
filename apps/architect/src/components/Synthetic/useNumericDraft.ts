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

/**
 * The bounds and step a numeric `<input>` should carry, so its spinner and its
 * browser-native validity describe the same window the commit guard enforces.
 * An open side contributes no attribute rather than an unusable one.
 */
const numericInputAttributes = (window: NumericWindow) => ({
  type: 'number' as const,
  ...(window.min === undefined ? {} : { min: window.min }),
  ...(window.max === undefined ? {} : { max: window.max }),
  step: window.integer ? 1 : ('any' as const),
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
    inputAttributes: numericInputAttributes(window),
  };
};
