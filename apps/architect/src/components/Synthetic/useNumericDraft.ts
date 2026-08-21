import { useEffect, useState } from 'react';

import type { NumericWindow } from '../schemaIntrospection';

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
