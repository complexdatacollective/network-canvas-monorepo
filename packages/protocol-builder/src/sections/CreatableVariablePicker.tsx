import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
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
  createdUnassigned: {
    id: 'protocolBuilder.variablePicker.createdUnassigned',
    defaultMessage:
      '“{variableName}” was added to the codebook, but it has not been selected here.',
    description:
      'Notice under the create button, shown when the attribute the researcher named was added to the codebook — the protocol’s definition of what an interview records — but whatever they were creating it for did not take it. variableName is the name they typed and is not translated.',
  },
});

/**
 * The package's one sentence for "the codebook has it, and nothing here took
 * it".
 *
 * Exported because the event is not this control's alone. Every route that
 * creates an attribute FOR something can land in the moment where that
 * something has moved on — a row a collaborator replaced, a stage repointed at
 * another type while the write was with the host — and what has to be said is
 * the same fact each time: the write landed, so do not try again, and here is
 * where the attribute went. A second wording of it would be a second thing for
 * a researcher to learn. Said about their own surfaces by
 * `AttributeCodebookControls` and by the form-field row's own save.
 */
export const createdUnassigned = messages.createdUnassigned;

/**
 * What became of a create the researcher asked for.
 *
 * Three answers rather than two, because "it does not exist" and "it exists,
 * and nothing here was given it" are opposite instructions to this control. A
 * refusal is ABOUT the name in the box, so the name stays there to be
 * corrected. An attribute that EXISTS must leave the box whatever happened
 * next: pressing Create again would ask the codebook for a name it already
 * holds, and the duplicate-name refusal that comes back is about something the
 * researcher did not do.
 */
export type CreateOptionOutcome =
  /** The attribute exists, and the caller has been given it. */
  | Readonly<{ status: 'created' }>
  /**
   * The attribute exists, and nothing here was given it — whatever the caller
   * was creating it for was replaced, removed or stopped taking changes while
   * the codebook was being written to. Not a failure: the write succeeded, and
   * what is left to say is where the attribute went.
   */
  | Readonly<{ status: 'unassigned' }>
  /** Nothing was created. The name is the researcher's to correct. */
  | Readonly<{ status: 'refused' }>;

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
     * Answers with what became of the create — see `CreateOptionOutcome`. A
     * codebook write can be refused (a name it cannot store, a section someone
     * else is holding) and it can land somewhere the caller can no longer use,
     * and both answers arrive after the researcher has let go of the button,
     * so the control has to wait for one before deciding what to do with the
     * name they typed.
     */
    onCreateOption?: (variableName: string) => Promise<CreateOptionOutcome>;
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
 *
 * Until it EXISTS, not until it was assigned: an attribute the codebook now
 * holds is one this box may not offer to create again, whatever became of it
 * afterwards, because the second press is refused for a duplicate name the
 * researcher did not choose to ask for twice. So the box empties on both
 * answers that mean the write landed, and the one where nothing here took the
 * attribute says so — otherwise emptying the box beside an unchanged
 * selection is indistinguishable from a create that quietly did nothing.
 *
 * The box is held with the button while the write is in flight, for the same
 * reason and one more. The create submits the name as it was when it was
 * pressed, so a name typed while the answer was on its way was erased by a
 * success and contradicted by a refusal — the sentence is about the submitted
 * name, and it arrived beside a box showing a different one. Held, the box is
 * always exactly what the answer is about.
 */
export function CreatableVariablePickerControl({
  onCreateOption,
  ...pickerProps
}: CreatableVariablePickerProps) {
  const intl = useAppIntl();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * The name of an attribute that was created and then taken by nothing, held
   * for as long as the notice about it is on screen.
   *
   * The submitted name rather than whatever the box holds now: the notice is
   * about the attribute that was created, and the box is empty by the time it
   * appears.
   */
  const [unassignedName, setUnassignedName] = useState<string | undefined>(
    undefined,
  );
  const { disabled = false, readOnly = false } = pickerProps;

  if (onCreateOption === undefined) {
    return <VariablePickerControl {...pickerProps} />;
  }

  const create = async () => {
    const submitted = name.trim();
    setBusy(true);
    setUnassignedName(undefined);
    try {
      const outcome = await onCreateOption(submitted);
      // A refusal is ABOUT this name, so it stays in the box to be corrected.
      if (outcome.status === 'refused') return;
      // Every other answer means the codebook now holds it, and asking for it
      // a second time is refused for a duplicate name.
      setName('');
      if (outcome.status === 'unassigned') setUnassignedName(submitted);
    } catch {
      // A caller that throws — synchronously, or by rejecting, or by answering
      // with something that is not an outcome at all — has broken the promise
      // `onCreateOption` makes, and from here they are the same broken promise:
      // nothing is known to exist, there is nothing more specific the
      // researcher could be told, and the name they typed stays in the box for
      // another try. `callGateway` answers a host that throws the same way, for
      // the same reason. Everything is inside the `try` rather than only the
      // call, so a synchronous throw is caught too.
    } finally {
      // In a `finally` because the button is disabled while this is true: a
      // create that ended in a throw would otherwise leave the researcher
      // looking at a Create button that never comes back, with no way to try
      // again.
      setBusy(false);
    }
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
        disabled={disabled || readOnly || busy}
        // Enter here means "create the attribute", and it has to be said so.
        // This box is inside a form whose submit means something else — the
        // stage's own, whose default button is the host's Save, associated by
        // `form=` and therefore the form's default button wherever the host
        // renders it, and a row dialog's — so the browser's implicit
        // submission saved and closed the editor instead, creating nothing and
        // taking the typed name with it. `QuickAddSection`'s own name box
        // answers Enter for the same reason.
        onKeyDown={(event) => {
          // A key pressed to compose a character is not a key press.
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          // Whatever else is true, Enter in this box does not mean "save".
          event.preventDefault();
          // Nothing is named, so there is nothing to create — the one part of
          // the button's own guard a key press can still reach, since the box
          // is disabled in every other case the button is.
          if (name.trim() === '') return;
          void create();
        }}
        onChange={(next: unknown) => {
          // The notice is about the create that has just happened; naming
          // another attribute is the start of a different one.
          setUnassignedName(undefined);
          setName(typeof next === 'string' ? next : '');
        }}
      />
      {/* One column child, so the always-mounted live region below the button
          takes up no room while it is saying nothing — a gap between flex
          items is spent on an empty child too. */}
      <div className="flex flex-col">
        <Button
          // Never a submit: this control lives inside a form whose submit means
          // something else entirely, on both the stage and a row dialog.
          type="button"
          disabled={disabled || readOnly || busy || name.trim() === ''}
          onClick={() => void create()}
        >
          {intl.formatMessage(messages.createAction)}
        </Button>
        {/* Always mounted, so a screen reader is watching this region before
            the notice appears: a live region added to the page at the same
            moment as its own content is not reliably announced.

            The `Alert` inside it is presentational for exactly that reason.
            Its `info` variant is a `role="status"` of its own — a second
            polite region, inserted into this one at the moment its content
            appears, which is the double (or, on some assistive technology,
            dropped) announcement this wrapper exists to avoid. Same shape as
            the bounds notice in `VariableParameterFields`. */}
        <div
          role="status"
          aria-live="polite"
          className={unassignedName === undefined ? undefined : 'mt-3'}
        >
          {unassignedName !== undefined && (
            <Alert variant="info" role="presentation">
              <AlertDescription>
                {intl.formatMessage(messages.createdUnassigned, {
                  variableName: unassignedName,
                })}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
