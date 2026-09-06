import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import {
  VariablePickerControl,
  type VariablePickerProps,
} from '../fields/VariablePicker.tsx';

export type CreatableVariablePickerProps = VariablePickerProps &
  Readonly<{
    /**
     * Adds an attribute to the codebook under this name and selects it here.
     *
     * Optional, and omitted is the plain picker: a control that chooses from
     * what exists is the right answer wherever inventing an attribute would be
     * a decision the researcher has not been asked to make. What TYPE gets
     * created is the caller's — the row knows what it is going to do with the
     * attribute, and the researcher is only ever asked for a name.
     */
    onCreateOption?: (variableName: string) => void;
  }>;

/**
 * The attribute picker, with a way to invent the attribute that is missing.
 *
 * The pool a picker offers is the codebook as it stands, and the attribute a
 * researcher wants is often the one they have only just thought of — deciding
 * to mark these people and inventing the flag to mark them with is one
 * thought, and a picker that could only choose would send them to the codebook
 * and back to finish it.
 *
 * The name box is beside the list rather than inside it, because the two are
 * different acts: the list chooses something that exists, and this asks for
 * something to be made. It is deliberately not a form field of anything — what
 * the researcher types here is the attribute's name, and what the surrounding
 * field stores is the id the codebook hands back.
 */
export function CreatableVariablePickerControl({
  onCreateOption,
  ...pickerProps
}: CreatableVariablePickerProps) {
  const [name, setName] = useState('');
  const { disabled = false, readOnly = false } = pickerProps;

  if (onCreateOption === undefined) {
    return <VariablePickerControl {...pickerProps} />;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <VariablePickerControl {...pickerProps} />
      <UnconnectedField<typeof InputField>
        name="newAttributeName"
        component={InputField}
        label="Create a new attribute"
        hint="Adds it to this type’s codebook and selects it above."
        placeholder="nominated early"
        value={name}
        disabled={disabled || readOnly}
        onChange={(next: unknown) =>
          setName(typeof next === 'string' ? next : '')
        }
      />
      <Button
        // Never a submit: this control lives inside a form whose submit means
        // something else entirely, on both the stage and a row dialog.
        type="button"
        disabled={disabled || readOnly || name.trim() === ''}
        onClick={() => {
          onCreateOption(name.trim());
          setName('');
        }}
      >
        Create the attribute
      </Button>
    </div>
  );
}
