import type { ReactNode } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import { type NumericWindow, useNumericDraft } from './useNumericDraft';

/**
 * One numeric generation parameter, held inside the window its schema states
 * (spec governing rule 2: a value the schema would refuse must not be
 * enterable). The single such control: the stage editor's distribution
 * parameters and panel odds, and the codebook variable editor's parameters,
 * are all this component, so a researcher meets one typing behaviour wherever
 * a generation parameter is edited.
 *
 * The typing and refusal behaviour lives in `useNumericDraft`, which the
 * option-weight column and the selection-count table share directly.
 *
 * REFUSAL rather than clamping. A window may be open or exclusive on the
 * offending side — a beta's mean lives strictly between 0 and 1 — so clamping
 * 1.4 to 1 hands back a number the schema refuses just as firmly as the one
 * that was typed, and clamping 40 to 6 silently substitutes a value the
 * researcher did not write. Refusing leaves the entry visible until blur,
 * which is what makes the refusal legible.
 */

export type SyntheticNumberFieldProps = {
  /** Field name, used for the control's id and its error association. */
  name: string;
  label: string;
  /**
   * Prose beneath the control. Carries the whole sentence explaining a
   * disabled parameter, which `UnconnectedField` also wires up as the
   * control's accessible description.
   */
  hint?: ReactNode;
  /** The committed value; `undefined` renders an empty box. */
  value: number | undefined;
  /** The window this parameter may take, as its schema states it. */
  window: NumericWindow;
  /** Whether clearing the box is a legal way to leave the parameter unstated. */
  clearable?: boolean;
  /** The schema's own refusals for this parameter, rendered unparaphrased. */
  errors?: readonly string[];
  disabled?: boolean;
  onCommit: (value: number | undefined) => void;
};

export function SyntheticNumberField({
  name,
  label,
  hint,
  value,
  window,
  clearable = false,
  errors,
  disabled = false,
  onCommit,
}: SyntheticNumberFieldProps) {
  const { text, onChange, onBlur, inputAttributes } = useNumericDraft({
    value,
    window,
    clearable,
    onCommit,
  });

  return (
    <UnconnectedField
      name={name}
      label={label}
      {...(hint === undefined ? {} : { hint })}
      component={InputField}
      {...inputAttributes}
      value={text}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      {...(errors && errors.length > 0
        ? { errors: [...errors], showErrors: true }
        : {})}
    />
  );
}
