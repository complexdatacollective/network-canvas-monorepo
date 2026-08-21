import { type ReactNode, useEffect, useState } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SyntheticWindow } from '~/components/Synthetic/summaries';

/**
 * One numeric generation parameter, held inside the window the schema admits
 * for it (spec governing rule 2: a value the schema would refuse must not be
 * enterable).
 *
 * `InputField` is string-valued, and a number typed a digit at a time passes
 * through states nobody means — an empty box, a lone minus sign, a trailing
 * decimal point. So the box keeps the researcher's TEXT while the parameter
 * keeps a number: a keystroke that parses is clamped into the window and
 * committed, one that does not is simply not committed, and blur re-synchronises
 * the box with the value that was.
 *
 * The window comes from the schema (a count's resolution bounds, a metric's
 * domain, a sibling bound that must not be crossed) and is enforced twice
 * over: as the input's own `min`/`max`, so the control announces its range and
 * its spinner respects it, and as the clamp above, which is what a paste or a
 * typed-out-of-range value meets.
 */

export type SyntheticNumberFieldProps = {
  /** Field name, used for the control's id and its error association. */
  name: string;
  label: string;
  hint?: ReactNode;
  /** The committed value; `undefined` renders an empty box. */
  value: number | undefined;
  /** The inclusive window this parameter may take, from the schema. */
  window: SyntheticWindow;
  /** Whole numbers only — the schema refuses a fraction for this field. */
  integral?: boolean;
  /** The schema's own refusals for this parameter, rendered unparaphrased. */
  errors?: string[];
  disabled?: boolean;
  onCommit: (value: number) => void;
};

const format = (value: number | undefined): string =>
  value === undefined ? '' : String(value);

export function SyntheticNumberField({
  name,
  label,
  hint,
  value,
  window,
  integral = false,
  errors,
  disabled,
  onCommit,
}: SyntheticNumberFieldProps) {
  const [text, setText] = useState(() => format(value));

  // A value that changes underneath the box — an undo, a reset, a clamp —
  // replaces what is in it. A value that does not change leaves the
  // researcher's own text alone, which is what keeps a refused entry visible
  // beside the refusal.
  useEffect(() => {
    setText(format(value));
  }, [value]);

  const handleChange = (next: string | undefined) => {
    const raw = next ?? '';
    setText(raw);
    if (raw.trim() === '') return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;

    const bounded = Math.min(Math.max(parsed, window.min), window.max);
    onCommit(integral ? Math.round(bounded) : bounded);
  };

  return (
    <UnconnectedField
      name={name}
      label={label}
      {...(hint === undefined ? {} : { hint })}
      component={InputField}
      type="number"
      value={text}
      onChange={handleChange}
      onBlur={() => setText(format(value))}
      min={window.min}
      {...(Number.isFinite(window.max) ? { max: window.max } : {})}
      {...(integral ? { step: 1 } : {})}
      disabled={disabled}
      {...(errors && errors.length > 0 ? { errors, showErrors: true } : {})}
    />
  );
}
