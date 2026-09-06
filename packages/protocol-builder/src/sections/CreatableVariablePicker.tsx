import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

import {
  VariablePickerControl,
  type VariablePickerProps,
} from '../fields/VariablePicker.tsx';

const messages = defineMessages({
  createLabel: {
    id: 'protocolBuilder.variablePicker.createLabel',
    defaultMessage: 'Create a new attribute',
    description:
      'Label of the box where a researcher types the name of an attribute that does not exist yet, beside the list of the ones that do. An attribute is one thing an interview records about a network member.',
  },
  createHint: {
    id: 'protocolBuilder.variablePicker.createHint',
    defaultMessage: 'Adds it to this type’s codebook and selects it above.',
    description:
      'Guidance under the box for naming a new attribute, saying that it lands in the codebook — the protocol’s definition of what an interview records — and becomes the choice made above.',
  },
  createPlaceholder: {
    id: 'protocolBuilder.variablePicker.createPlaceholder',
    defaultMessage: 'nominated_early',
    description:
      'Example attribute name shown in the empty box. A name the codebook would accept: letters, digits and the symbols . _ - : only, so it deliberately has no space in it. Translate it to an equally valid example if that reads better.',
  },
  createAction: {
    id: 'protocolBuilder.variablePicker.createAction',
    defaultMessage: 'Create the attribute',
    description:
      'Button that adds the attribute named in the box beside it to the codebook and selects it.',
  },
});

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
     *
     * Answers with whether the attribute now exists. A codebook write can be
     * refused — a name it cannot store, a section someone else is holding —
     * and the refusal arrives after the researcher has let go of the button,
     * so the control has to wait for it before deciding what to do with the
     * name they typed.
     */
    onCreateOption?: (variableName: string) => Promise<boolean>;
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
 *
 * The name stays until the attribute exists. Emptying the box on the click
 * emptied it ahead of the answer, so a refusal — which is ABOUT the name they
 * typed — arrived with the name gone and nothing to correct. Mirrors quick
 * add's own create (`QuickAddSection`), which is the same act on the stage.
 */
export function CreatableVariablePickerControl({
  onCreateOption,
  ...pickerProps
}: CreatableVariablePickerProps) {
  const intl = useAppIntl();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { disabled = false, readOnly = false } = pickerProps;

  if (onCreateOption === undefined) {
    return <VariablePickerControl {...pickerProps} />;
  }

  const create = async () => {
    setBusy(true);
    let created = false;
    try {
      created = await onCreateOption(name.trim());
    } catch {
      // A caller that throws — synchronously, or by rejecting — has broken the
      // promise `onCreateOption` makes, and from here the two are the same
      // broken promise: the attribute does not exist, there is nothing more
      // specific the researcher could be told about it, and the name they typed
      // stays in the box for another try. `callGateway` answers a host that
      // throws the same way, for the same reason. The call is inside the `try`
      // rather than before it, so a synchronous throw is caught too.
      created = false;
    } finally {
      // In a `finally` because the button is disabled while this is true: a
      // create that ended in a throw would otherwise leave the researcher
      // looking at a Create button that never comes back, with no way to try
      // again.
      setBusy(false);
    }
    if (created) setName('');
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <VariablePickerControl {...pickerProps} />
      <UnconnectedField<typeof InputField>
        name="newAttributeName"
        component={InputField}
        label={intl.formatMessage(messages.createLabel)}
        hint={intl.formatMessage(messages.createHint)}
        // A name the codebook would actually take. `VariableNameSchema` allows
        // letters, digits and `. _ - :` and nothing else, so a placeholder with
        // a space in it showed the researcher an example of a name that is
        // refused the moment they type it.
        placeholder={intl.formatMessage(messages.createPlaceholder)}
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
        disabled={disabled || readOnly || busy || name.trim() === ''}
        onClick={() => void create()}
      >
        {intl.formatMessage(messages.createAction)}
      </Button>
    </div>
  );
}
