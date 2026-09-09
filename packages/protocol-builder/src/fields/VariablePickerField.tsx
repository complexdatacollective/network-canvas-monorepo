import { useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Pill from '@codaco/fresco-ui/Pill';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

import { createVariableRefused } from '../codebook/useCodebookVariableEdits.ts';

export type VariablePickerOption = Readonly<{
  value: string;
  label: string;
  type?: VariableType;
  /**
   * Whether this attribute can be chosen here. Absent means it can.
   *
   * An option the caller has ruled out is not the same thing as one the caller
   * never mentioned: it is shown when the field already holds it, and named
   * for what is wrong with it, rather than reported as a reference the
   * codebook has lost.
   */
  usable?: boolean;
  /**
   * What to say about an option the caller has ruled out, in the caller's own
   * words: the name the held option is listed under, and the sentence shown
   * beneath the select.
   *
   * Read only while `usable` is false. Absent, the picker says the attribute
   * cannot carry a rule, which is what every rule caller means by ruling one
   * out — but a pedigree slot rules out a categorical attribute whose VALUES
   * a collaborator edited, and told it "cannot be used in a rule" a researcher
   * goes looking for a rule they never wrote. Formatted by the caller, the way
   * `emptyMessage` is: the words belong to whatever the choice is being made
   * for, and that is the module whose catalog carries them.
   */
  unusableWords?: Readonly<{ optionLabel: string; note: string }>;
}>;

export type VariablePickerFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    options?: readonly VariablePickerOption[];
    /** Shown in place of the list when nothing can be picked yet. */
    emptyMessage?: string;
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
  }
>;

const messages = defineMessages({
  placeholder: {
    id: 'protocolBuilder.variablePicker.placeholder',
    defaultMessage: 'Select an attribute…',
    description:
      'Placeholder in the select a researcher chooses one codebook attribute from, shown while nothing has been chosen. An attribute is a variable the protocol’s codebook defines for a node type, an edge type or the interview participant.',
  },
  emptyState: {
    id: 'protocolBuilder.variablePicker.emptyState',
    defaultMessage: 'No attributes are available to choose from.',
    description:
      'Shown in place of the select when nothing can be picked — the caller offered no attributes at all. An attribute is a variable the protocol’s codebook defines. Callers that can say something more specific pass their own sentence instead.',
  },
  /**
   * Names a stored choice that is not among the attributes this picker was
   * given.
   *
   * A stored id the list does not describe is kept and shown rather than
   * quietly dropped: blanking the control would hide the very reference the
   * researcher has to resolve, and would then write the blank back over it.
   *
   * It says only that, because that is all this control knows. An attribute
   * the researcher has deleted is one case; another is an attribute the CALLER
   * has ruled out and left out of the list — a pedigree slot whose interface
   * owns the exact values its attribute must hold refuses one whose values a
   * collaborator has since edited, and that attribute is sitting in the
   * codebook exactly where the researcher left it. Told it was "no longer in
   * the codebook", they would go looking for something that never went
   * anywhere. A caller that KNOWS which it is keeps the option, marks it
   * `usable: false` and passes its own `unusableWords`, which are shown
   * instead.
   */
  missingOptionLabel: {
    id: 'protocolBuilder.variablePicker.missingOptionLabel',
    defaultMessage: '{attributeId} — this attribute is not available here',
    description:
      'Name of the one option standing for an attribute that is not among the ones this control was given to offer. attributeId is the raw stored identifier — there is no name to show, because no definition of it reached this control.',
  },
  /**
   * Names an attribute that is still in the codebook and still cannot carry a
   * rule — a layout attribute, answered with a point nothing can be compared
   * against.
   *
   * Its own wording, because the researcher's next move differs: a deleted
   * attribute is one to find or recreate, and this one is sitting where they
   * left it. Told it was "no longer in the codebook", they would go looking
   * for something that never went anywhere.
   *
   * These are the picker's words for the only reason a RULE caller has. A
   * caller ruling an attribute out for a reason of its own passes
   * `unusableWords` on the option, and neither of these two is read.
   */
  unusableOptionLabel: {
    id: 'protocolBuilder.variablePicker.unusableOptionLabel',
    defaultMessage: '{attributeName} — cannot be used in a rule',
    description:
      'Name of the one option standing for an attribute that is still in the protocol’s codebook and still cannot carry a rule, such as one answered with a map position. attributeName is the researcher’s own name for it, from the codebook, and is not translated.',
  },
  missingAttribute: {
    id: 'protocolBuilder.variablePicker.missingAttribute',
    defaultMessage: 'This attribute is not available here. Choose another one.',
    description:
      'Shown under the select when the attribute a researcher’s stored choice names is not among the ones this control was given to offer — it may have been deleted from the protocol’s codebook, or ruled out by whatever the choice is being made for. Worded for what the control actually knows: it is handed a list of attributes and a stored choice, and cannot tell those two cases apart.',
  },
  unusableAttribute: {
    id: 'protocolBuilder.variablePicker.unusableAttribute',
    defaultMessage:
      'This attribute cannot be used in a rule. Choose another one.',
    description:
      'Shown under the select when the attribute a researcher’s stored choice names is still in the codebook but cannot carry a rule. Worded apart from the deleted-attribute sentence on purpose: this attribute is still where the researcher left it.',
  },
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
  attributeTypeLabel: {
    id: 'protocolBuilder.variablePicker.attributeTypeLabel',
    defaultMessage: 'Attribute type: {attributeType}',
    description:
      'Accessible name of the badge stating what kind of answer the chosen attribute records. attributeType is a protocol schema token such as "number", "text" or "categorical", and is shown as it is stored rather than translated. Read as a label and its value, not as a sentence.',
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

/**
 * What this control has left to say once a create has ended.
 *
 * Only the two events nobody else says anything about. A `refused` outcome is
 * not among them: it is a sentence the CALLER already has — it knows what the
 * codebook would not take — and it is shown on the surface the researcher
 * asked from, so a second notice here would say the same thing twice.
 */
type CreateNotice =
  /** The attribute exists, and nothing here was given it. */
  | Readonly<{ kind: 'unassigned'; variableName: string }>
  /**
   * The create ended without an answer at all — the caller broke the promise
   * `onCreateOption` makes, so nothing is known to exist and nobody has told
   * the researcher anything.
   */
  | Readonly<{ kind: 'failed' }>;

/**
 * Chooses one codebook attribute, and — where the caller allows it — invents
 * the one that is missing.
 *
 * It takes its options rather than reading a codebook, because what may be
 * offered depends on what the choice is FOR: a rule offers the attributes it
 * can compare, a form field drops the ones its siblings already collect and
 * the ones the interface writes for itself, a pedigree slot drops the ones
 * whose values no longer fit. Each of those is a rule over the whole pool,
 * held by the section that knows it, and the section is already subscribed to
 * the protocol the pool is built from.
 *
 * The pool a picker offers is the codebook as it stands, and the attribute a
 * researcher wants is often the one they have only just thought of — deciding
 * to mark these people and inventing the flag to mark them with is one
 * thought, and a picker that could only choose would send them to the codebook
 * and back to finish it. So a caller that knows what an invented attribute
 * would be for passes `onCreateOption`; one that does not gets the plain
 * picker.
 *
 * The name box is beside the list rather than inside it, because the two are
 * different acts: the list chooses something that exists, and this asks for
 * something to be made. What the researcher types here is the attribute's
 * name, and what this field stores is the id the codebook hands back.
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
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export default function VariablePickerField({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  options = [],
  emptyMessage,
  onCreateOption,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: VariablePickerFieldProps) {
  const intl = useAppIntl();
  const [newVariableName, setNewVariableName] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * What is left to say about the create that has just happened, held for as
   * long as the notice about it is on screen.
   *
   * One piece of state and one region rather than two, because the two things
   * this control ever has to say are answers to the same press and can never
   * both be true: the attribute exists and nothing here took it, or nothing
   * was written at all.
   *
   * `unassigned` carries the SUBMITTED name rather than whatever the box holds
   * now — the sentence is about the attribute that was created, and the box is
   * empty by the time it appears. `failed` carries none, because there is no
   * attribute to name.
   */
  const [notice, setNotice] = useState<CreateNotice | undefined>(undefined);
  const selected = options.find((option) => option.value === value);
  const isMissing =
    value !== undefined && value !== '' && selected === undefined;
  const isUnusable = selected?.usable === false;
  const unusableWords = isUnusable ? selected?.unusableWords : undefined;

  const selectOptions = useMemo(() => {
    const listed = options.flatMap((option) =>
      option.usable === false
        ? []
        : [{ value: option.value, label: option.label }],
    );
    // The choice the field already holds is offered so the control can show it
    // as selected — a native select falls back to its placeholder otherwise,
    // showing nothing chosen over a rule that is pointed somewhere, and saving
    // the blank back. It goes last, so it never sits among the attributes a
    // rule can actually be built on.
    if (isMissing && value !== undefined) {
      return [
        ...listed,
        {
          value,
          label: intl.formatMessage(messages.missingOptionLabel, {
            attributeId: value,
          }),
        },
      ];
    }
    if (isUnusable && selected !== undefined) {
      return [
        ...listed,
        {
          value: selected.value,
          label:
            unusableWords?.optionLabel ??
            intl.formatMessage(messages.unusableOptionLabel, {
              attributeName: selected.label,
            }),
        },
      ];
    }
    return listed;
  }, [intl, isMissing, isUnusable, options, selected, unusableWords, value]);

  const create = async () => {
    if (onCreateOption === undefined) return;
    const submitted = newVariableName.trim();
    setBusy(true);
    setNotice(undefined);
    try {
      const outcome = await onCreateOption(submitted);
      // A refusal is ABOUT this name, so it stays in the box to be corrected —
      // and it is said by whoever refused it, on the surface that asked. This
      // control is handed an outcome with no words of its own precisely
      // because the caller has already put the reason where the researcher is
      // looking.
      if (outcome.status === 'refused') return;
      // Every other answer means the codebook now holds it, and asking for it
      // a second time is refused for a duplicate name.
      setNewVariableName('');
      if (outcome.status === 'unassigned') {
        setNotice({ kind: 'unassigned', variableName: submitted });
      }
    } catch {
      // A caller that throws — synchronously, or by rejecting, or by answering
      // with something that is not an outcome at all — has broken the promise
      // `onCreateOption` makes, and from here they are the same broken promise:
      // nothing is known to exist, and the name they typed stays in the box for
      // another try. `callGateway` answers a host that throws the same way, for
      // the same reason. Everything is inside the `try` rather than only the
      // call, so a synchronous throw is caught too.
      //
      // Said rather than swallowed. A broken promise is not a refusal the
      // caller has explained somewhere — nobody has said anything, so the
      // button coming back beside an unchanged row is all the researcher gets,
      // and it is indistinguishable from a press that never happened. Their
      // next move is to press Create again: the same failing write, or, if
      // that first one did land somewhere this control never heard about, a
      // duplicate-name refusal about an attempt they never made. So the one
      // sentence the package already has for a codebook write refused with no
      // explanation of its own is said here too, rather than a second wording
      // of it.
      setNotice({ kind: 'failed' });
    } finally {
      // In a `finally` because the button is disabled while this is true: a
      // create that ended in a throw would otherwise leave the researcher
      // looking at a Create button that never comes back, with no way to try
      // again.
      setBusy(false);
    }
  };

  return (
    <div
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx('w-full', className)}
    >
      {selectOptions.length === 0 ? (
        <p
          id={id}
          aria-describedby={ariaDescribedBy}
          className="w-full py-6 text-center text-sm text-current/70 italic"
        >
          {emptyMessage ?? intl.formatMessage(messages.emptyState)}
        </p>
      ) : (
        <div className="flex w-full flex-col items-start gap-3">
          <NativeSelectField
            id={id}
            name={name}
            value={value ?? ''}
            onChange={(next) => {
              if (disabled || readOnly) return;
              onChange?.(typeof next === 'string' ? next : String(next ?? ''));
            }}
            options={selectOptions}
            placeholder={intl.formatMessage(messages.placeholder)}
            disabled={disabled}
            readOnly={readOnly}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-labelledby={ariaLabelledBy}
            aria-required={ariaRequired}
          />
          {/*
            The type is stated beside the choice rather than only implied by
            the control's colour: it decides which operators the next control
            offers, so the researcher needs to be able to read it.
          */}
          {selected?.type !== undefined && (
            <Pill
              variant="outline"
              className="variable-pill max-w-full"
              data-attribute-type={selected.type}
              // A label and its value, not a sentence: the words around the
              // type name never have to agree with it grammatically.
              aria-label={intl.formatMessage(messages.attributeTypeLabel, {
                attributeType: selected.type,
              })}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis">
                {selected.type}
              </span>
            </Pill>
          )}
          {isMissing && (
            <p className="text-destructive text-sm">
              {intl.formatMessage(messages.missingAttribute)}
            </p>
          )}
          {isUnusable && (
            <p className="text-destructive text-sm">
              {unusableWords?.note ??
                intl.formatMessage(messages.unusableAttribute)}
            </p>
          )}
        </div>
      )}
      {onCreateOption !== undefined && (
        <>
          <UnconnectedField<typeof InputField>
            name="newAttributeName"
            component={InputField}
            label={intl.formatMessage(messages.createLabel)}
            hint={intl.formatMessage(messages.createHint)}
            // A name the codebook would actually take. `VariableNameSchema`
            // allows letters, digits and `. _ - :` and nothing else, so a
            // placeholder with a space in it showed the researcher an example
            // of a name that is refused the moment they type it.
            placeholder={intl.formatMessage(messages.createPlaceholder)}
            value={newVariableName}
            disabled={disabled || readOnly || busy}
            // Enter here means "create the attribute", and it has to be said
            // so. This box is inside a form whose submit means something else
            // — the stage's own, whose default button is the host's Save,
            // associated by `form=` and therefore the form's default button
            // wherever the host renders it, and a row dialog's — so the
            // browser's implicit submission saved and closed the editor
            // instead, creating nothing and taking the typed name with it.
            // `QuickAddSection`'s own name box answers Enter for the same
            // reason.
            onKeyDown={(event) => {
              // A key pressed to compose a character is not a key press.
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
                return;
              }
              // Whatever else is true, Enter in this box does not mean "save".
              event.preventDefault();
              // Nothing is named, so there is nothing to create — the one part
              // of the button's own guard a key press can still reach, since
              // the box is disabled in every other case the button is.
              if (newVariableName.trim() === '') return;
              void create();
            }}
            onChange={(next: unknown) => {
              // The notice is about the create that has just happened; naming
              // another attribute is the start of a different one.
              setNotice(undefined);
              setNewVariableName(typeof next === 'string' ? next : '');
            }}
          />
          {/* One column child, so the always-mounted live region below the
              button takes up no room while it is saying nothing — a gap
              between flex items is spent on an empty child too. */}
          <div className="flex flex-col">
            <Button
              // Never a submit: this control lives inside a form whose submit
              // means something else entirely, on both the stage and a row
              // dialog.
              type="button"
              disabled={
                disabled || readOnly || busy || newVariableName.trim() === ''
              }
              onClick={() => void create()}
            >
              {intl.formatMessage(messages.createAction)}
            </Button>
            {/* Always mounted, so a screen reader is watching this region
                before the notice appears: a live region added to the page at
                the same moment as its own content is not reliably announced.

                The `Alert` inside it is presentational for exactly that
                reason. Its `info` variant is a `role="status"` of its own —
                and its `destructive` variant a `role="alert"` — so either
                would be a second live region inserted into this one at the
                moment its content appears, which is the double (or, on some
                assistive technology, dropped) announcement this wrapper exists
                to avoid. Same shape as the bounds notice in
                `VariableParameterFields`.

                One region for both sentences, and polite for both. Neither
                interrupts anything: they are said about a press the researcher
                has already made and finished waiting for, and the control they
                would act on next is the one their focus is already in. */}
            <div
              role="status"
              aria-live="polite"
              className={notice === undefined ? undefined : 'mt-3'}
            >
              {notice?.kind === 'unassigned' && (
                <Alert variant="info" role="presentation">
                  <AlertDescription>
                    {intl.formatMessage(messages.createdUnassigned, {
                      variableName: notice.variableName,
                    })}
                  </AlertDescription>
                </Alert>
              )}
              {notice?.kind === 'failed' && (
                <Alert variant="destructive" role="presentation">
                  <AlertDescription>
                    {intl.formatMessage(createVariableRefused)}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
