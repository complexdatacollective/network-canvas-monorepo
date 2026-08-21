import type { ReactNode } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import type { NumericWindow } from '../schemaIntrospection';
import { useNumericDraft } from './useNumericDraft';

/**
 * One numeric generation parameter, held inside the window its schema states
 * (spec governing rule 2: a value the schema would refuse must not be
 * enterable). The typing and refusal behaviour lives in `useNumericDraft`,
 * which the option-weight column shares.
 */

export type SyntheticParameterFieldProps = {
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
  disabled?: boolean;
  onCommit: (value: number | undefined) => void;
};

export function SyntheticParameterField({
  name,
  label,
  hint,
  value,
  window,
  clearable = false,
  disabled = false,
  onCommit,
}: SyntheticParameterFieldProps) {
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
    />
  );
}
