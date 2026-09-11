import { Plus } from 'lucide-react';
import { useCallback, useRef, useState, type FocusEvent } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

import { createVariableRefused } from '../codebook/useCodebookVariableEdits.ts';
import AttributePill from './AttributePill.tsx';
import VariableSpotlight, {
  type CreateRowOutcome,
} from './VariableSpotlight.tsx';

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
   * beneath the control.
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
     * Every attribute name the type this would create on already holds, for
     * the create row to check a typed name against before asking.
     *
     * Wider than `options`, which the caller has already narrowed to the kinds
     * of answer it can use: a name is taken by a date attribute just as firmly
     * as by a text one. Passed in rather than read here, for the reason
     * `options` is — the picker is handed what a section knows, and a field
     * that read the protocol for itself could not be rendered outside one.
     */
    namesInUse?: readonly string[];
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
     * and both answers arrive after the researcher has let go of the row, so
     * the window has to wait for one before deciding what to do with the name
     * they typed.
     */
    onCreateOption?: (variableName: string) => Promise<CreateOptionOutcome>;
  }
>;

const messages = defineMessages({
  selectAttribute: {
    id: 'protocolBuilder.variablePicker.selectAttribute',
    defaultMessage: 'Select attribute',
    description:
      'Button that opens the window a researcher chooses one codebook attribute in, while nothing has been chosen yet. An attribute is a variable the protocol’s codebook defines for a node type, an edge type or the interview participant.',
  },
  changeAttribute: {
    id: 'protocolBuilder.variablePicker.changeAttribute',
    defaultMessage: 'Change attribute',
    description:
      'The same button once an attribute has been chosen, saying that pressing it replaces the choice rather than adding to it.',
  },
  noneSelected: {
    id: 'protocolBuilder.variablePicker.noneSelected',
    defaultMessage: 'No attribute selected',
    description:
      'Shown where the chosen attribute would be, while none has been chosen. Said rather than left blank, so an empty control reads as an unanswered question rather than as a control that failed to draw.',
  },
  emptyState: {
    id: 'protocolBuilder.variablePicker.emptyState',
    defaultMessage: 'No attributes are available to choose from.',
    description:
      'Shown in place of the control when nothing can be picked — the caller offered no attributes at all and does not allow one to be created. An attribute is a variable the protocol’s codebook defines. Callers that can say something more specific pass their own sentence instead.',
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
      'Shown under the control when the attribute a researcher’s stored choice names is not among the ones this control was given to offer — it may have been deleted from the protocol’s codebook, or ruled out by whatever the choice is being made for. Worded for what the control actually knows: it is handed a list of attributes and a stored choice, and cannot tell those two cases apart.',
  },
  unusableAttribute: {
    id: 'protocolBuilder.variablePicker.unusableAttribute',
    defaultMessage:
      'This attribute cannot be used in a rule. Choose another one.',
    description:
      'Shown under the control when the attribute a researcher’s stored choice names is still in the codebook but cannot carry a rule. Worded apart from the deleted-attribute sentence on purpose: this attribute is still where the researcher left it.',
  },
  createdUnassigned: {
    id: 'protocolBuilder.variablePicker.createdUnassigned',
    defaultMessage:
      '“{variableName}” was added to the codebook, but it has not been selected here.',
    description:
      'Notice under the control, shown when the attribute the researcher named was added to the codebook — the protocol’s definition of what an interview records — but whatever they were creating it for did not take it. variableName is the name they typed and is not translated.',
  },
  attributeTypeLabel: {
    id: 'protocolBuilder.variablePicker.attributeTypeLabel',
    defaultMessage: 'Attribute type: {attributeType}',
    description:
      'Read out after the chosen attribute’s name, saying what kind of answer it records. attributeType is a protocol schema token such as "number", "text" or "categorical", and is shown as it is stored rather than translated. Read as a label and its value, not as a sentence.',
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
 * refusal is ABOUT the name that was typed, so the window stays open with the
 * name still in the search box to be corrected. An attribute that EXISTS
 * closes the window whatever happened next: asking again would ask the
 * codebook for a name it already holds, and the duplicate-name refusal that
 * comes back is about something the researcher did not do.
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
  /**
   * Nothing was created. The name is the researcher's to correct, and the
   * window stays open on it.
   *
   * The reason comes with it where the caller has one. It used to be left on
   * the caller's own surface, which was right while the name was typed there —
   * it is typed in the picker's window now, and a sentence on the section
   * behind a modal is a sentence nobody reads.
   */
  | Readonly<{ status: 'refused'; message?: string }>;

/**
 * What this control has left to say once a create has ended.
 *
 * Only the two events nobody else says anything about, and both are said on
 * the FIELD rather than in the window, because the window has closed by the
 * time either is true. A `refused` outcome is not among them: it is a sentence
 * the CALLER already has — it knows what the codebook would not take — and the
 * window stays open with the name to correct, which is where the researcher is
 * looking.
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
 * A trigger and a window, not a list in place. The codebooks this searches are
 * long: a node type carried through a few studies holds dozens of attributes
 * of one kind, and every control that would have shown them inline buried
 * whatever the researcher was reading underneath it. So the field shows the
 * one thing that matters while it is closed — which attribute is chosen, and
 * what kind of answer it holds — and the choosing happens in a window with a
 * search box in it.
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
 * picker. Inventing is offered from inside the window, on the search term, so
 * that looking for an attribute and finding it does not exist are one act.
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
  namesInUse,
  onCreateOption,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
}: VariablePickerFieldProps) {
  const intl = useAppIntl();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /**
   * Whether the window that is closing was ANSWERED, rather than dismissed.
   *
   * A ref rather than state because the answer is read while the window is
   * closing, by Base UI's focus manager, and a re-render would not have
   * happened yet.
   */
  const answeredRef = useRef(false);
  /**
   * What is left to say about the create that has just happened, held for as
   * long as the notice about it is on screen.
   *
   * One piece of state and one region rather than two, because the two things
   * this control ever has to say are answers to the same press and can never
   * both be true: the attribute exists and nothing here took it, or nothing
   * was written at all.
   *
   * `unassigned` carries the SUBMITTED name rather than whatever the search
   * box held — the sentence is about the attribute that was created, and the
   * window has closed by the time it appears. `failed` carries none, because
   * there is no attribute to name.
   */
  const [notice, setNotice] = useState<CreateNotice | undefined>(undefined);

  const selected = options.find((option) => option.value === value);
  const held = value !== undefined && value !== '';
  const isMissing = held && selected === undefined;
  const isUnusable = selected?.usable === false;
  const unusableWords = isUnusable ? selected?.unusableWords : undefined;

  const offerable = options.filter((option) => option.usable !== false);
  /**
   * Nothing to choose, nothing to invent and nothing held, which is the one
   * state with no window worth opening. A trigger here would offer an act
   * whose whole content is a sentence saying it cannot be done.
   *
   * A HELD value keeps the control on screen whatever else is true. The
   * reference the researcher has to resolve is the one thing this field knows
   * and nothing else does, and replacing the control with "there is nothing to
   * choose from" would hide it — and then the researcher would have no way to
   * change it either.
   */
  const nothingToDo =
    !held && offerable.length === 0 && onCreateOption === undefined;

  /**
   * Where focus RETURNS when the window closes.
   *
   * Dismissal only. A window closed by actually choosing changes the field
   * underneath it — a new pill, and for a stage-level picker a whole section
   * that mounts below — and focus belongs with that new content. Putting it
   * back on the trigger also parks it inside this field's wrapper, whose blur
   * then fires on the researcher's next click anywhere in the form, and the
   * re-render that follows swallows that click.
   */
  const finalFocus = useCallback(
    () => (answeredRef.current ? false : triggerRef.current),
    [],
  );

  /**
   * Keeps the window's own focus changes from reading as the researcher
   * leaving this field.
   *
   * The window is portalled out of this subtree, but its React events still
   * bubble through the owner tree — so without this the search box taking
   * focus validates a field the researcher is in the middle of answering, and
   * the re-render that follows lands under their first click.
   */
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget;
      if (
        open ||
        (next instanceof Element && next.closest('[data-variable-spotlight]'))
      ) {
        event.stopPropagation();
        return;
      }
      onBlur?.(event);
    },
    [onBlur, open],
  );

  const handleSelect = useCallback(
    (next: string) => {
      if (disabled || readOnly) return;
      answeredRef.current = true;
      setNotice(undefined);
      onChange?.(next);
      setOpen(false);
    },
    [disabled, onChange, readOnly],
  );

  const handleCreate = useCallback(
    async (variableName: string): Promise<CreateRowOutcome> => {
      if (onCreateOption === undefined) return 'correct-the-name';
      answeredRef.current = true;
      setNotice(undefined);
      try {
        const outcome = await onCreateOption(variableName);
        // A refusal is ABOUT this name, so the window stays open with it still
        // in the search box — and it is said by whoever refused it, on the
        // surface that asked. This control is handed an outcome with no words
        // of its own precisely because the caller has already put the reason
        // where the researcher is looking.
        if (outcome.status === 'refused') {
          answeredRef.current = false;
          return outcome.message === undefined
            ? 'correct-the-name'
            : { keep: outcome.message };
        }
        // Every other answer means the codebook now holds it, and asking for
        // it a second time is refused for a duplicate name the researcher
        // never chose to ask for.
        if (outcome.status === 'unassigned') {
          setNotice({ kind: 'unassigned', variableName });
        }
        return 'finished';
      } catch {
        // A caller that throws — synchronously, or by rejecting, or by
        // answering with something that is not an outcome at all — has broken
        // the promise `onCreateOption` makes, and from here they are the same
        // broken promise: nothing is known to exist, and nobody has said
        // anything about it.
        //
        // Said rather than swallowed, and said on the FIELD rather than in the
        // window: a window left open would hold the one sentence the
        // researcher needs behind a search box they have no reason to look at
        // again, and the control they act on next is this one.
        setNotice({ kind: 'failed' });
        return 'finished';
      }
    },
    [onCreateOption],
  );

  const heldPill = (() => {
    if (isMissing && value !== undefined) {
      return (
        <AttributePill
          name={intl.formatMessage(messages.missingOptionLabel, {
            attributeId: value,
          })}
        />
      );
    }
    if (selected === undefined) return undefined;
    if (isUnusable) {
      return (
        <AttributePill
          name={
            unusableWords?.optionLabel ??
            intl.formatMessage(messages.unusableOptionLabel, {
              attributeName: selected.label,
            })
          }
          type={selected.type}
        />
      );
    }
    return <AttributePill name={selected.label} type={selected.type} />;
  })();

  return (
    <div
      data-name={name}
      onBlur={handleBlur}
      onFocus={onFocus}
      className={cx('flex w-full flex-col items-start gap-4', className)}
    >
      {nothingToDo ? (
        <p
          id={id}
          aria-describedby={ariaDescribedBy}
          className="w-full py-6 text-center text-sm text-current/70 italic"
        >
          {emptyMessage ?? intl.formatMessage(messages.emptyState)}
        </p>
      ) : (
        <>
          {/*
            A named group holding the answer, not a control: the control is the
            button below it.

            `aria-invalid` is a global state, so it says here what it used to
            say on the select. `aria-required` is not: ARIA allows it only on
            roles that take input, and there is no such role left on this field
            once the select has gone. Nothing is lost by dropping it — the
            required rule is one of the sentences `BaseField` already wires
            into `aria-describedby`, which is where a researcher reads it.
          */}
          <div
            id={id}
            role="group"
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            className={cx(
              // `min-w-0`: without it this box's automatic minimum is the
              // min-content of the pill inside, so a long attribute name makes
              // the whole picker — and the editor around it — refuse to
              // shrink.
              'bg-input text-input-contrast flex w-full min-w-0 flex-col items-start rounded border-2 p-4',
              ariaInvalid === true && 'border-destructive',
              disabled && 'opacity-50',
              readOnly && 'opacity-70',
            )}
          >
            {heldPill === undefined ? (
              <p className="w-full py-6 text-center text-sm text-current/70 italic">
                {offerable.length === 0 && emptyMessage !== undefined
                  ? emptyMessage
                  : intl.formatMessage(messages.noneSelected)}
              </p>
            ) : (
              <div className="w-full min-w-0">
                {heldPill}
                {/* The kind of answer decides which operators the next control
                    offers, so it is stated rather than left to the pill's
                    colour. Inside the field and not inside the pill: where the
                    same pill renders as a row of the window's list, that row's
                    accessible NAME has to be the attribute's own name. */}
                {selected?.type !== undefined && (
                  <span className="sr-only">
                    {intl.formatMessage(messages.attributeTypeLabel, {
                      attributeType: selected.type,
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            ref={triggerRef}
            type="button"
            icon={<Plus />}
            color="primary"
            disabled={disabled || readOnly}
            onClick={() => {
              answeredRef.current = false;
              setOpen(true);
            }}
            // Names this button as where a refused save should send focus for
            // this field: it is the control that resolves a "choose an
            // attribute" error, and it is not the first focusable element in
            // the field once one has been chosen.
            data-field-focus-target=""
          >
            {intl.formatMessage(
              held ? messages.changeAttribute : messages.selectAttribute,
            )}
          </Button>
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
          {/* Always mounted, so a screen reader is watching this region before
              the notice appears: a live region added to the page at the same
              moment as its own content is not reliably announced.

              The `Alert` inside it is presentational for exactly that reason.
              Its `info` variant is a `role="status"` of its own — and its
              `destructive` variant a `role="alert"` — so either would be a
              second live region inserted into this one at the moment its
              content appears, which is the double (or, on some assistive
              technology, dropped) announcement this wrapper exists to avoid.

              One region for both sentences, and polite for both. Neither
              interrupts anything: they are said about a create the researcher
              has already made and finished waiting for. */}
          <div role="status" aria-live="polite" className="w-full empty:hidden">
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
          <VariableSpotlight
            open={open}
            onOpenChange={(next) => {
              if (!disabled && !readOnly) setOpen(next);
            }}
            options={offerable}
            onSelect={handleSelect}
            {...(onCreateOption === undefined
              ? {}
              : { onCreate: handleCreate, namesInUse })}
            {...(ariaLabelledBy === undefined
              ? {}
              : { 'aria-labelledby': ariaLabelledBy })}
            finalFocus={finalFocus}
          />
        </>
      )}
    </div>
  );
}
