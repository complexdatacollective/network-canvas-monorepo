import { Combobox } from '@base-ui/react/combobox';
import { ChevronsUpDown } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useIsPresent,
  usePresenceData,
} from 'motion/react';
import {
  type FocusEvent,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { comboboxTriggerVariants } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import { getInputState } from '@codaco/fresco-ui/form/utils/getInputState';
import { useComboboxTriggerEscape } from '@codaco/fresco-ui/hooks/useComboboxTriggerEscape';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

import { createVariableRefused } from '../codebook/useCodebookVariableEdits.ts';
import type { VariableNameScope } from './variableNameRules.ts';
import VariablePickerList, {
  allPickerOptions,
  emptyAttributeListMessage,
  optionPillProps,
  typeDescriptionFor,
  VARIABLE_PICKER_POPUP_MARKER,
  type VariablePickerListProps,
} from './VariablePickerList.tsx';
import { VariablePill } from './VariablePill.tsx';

export type VariablePickerOption = Readonly<{
  value: string;
  label: string;
  type?: VariableType;
  /**
   * Why this attribute cannot be chosen here, as a whole sentence in the
   * reader's language. Absent means it can be chosen.
   *
   * An attribute with a reason is still listed, after the ones that can be
   * chosen and under their own heading, so a researcher looking for it finds
   * it and learns why it is not available instead of wondering where it went.
   * Choosing it selects nothing and shows the reason under it.
   *
   * An option the caller has ruled out is not the same thing as one the caller
   * never mentioned: when the field already holds it, it is shown as itself,
   * with this sentence under the control, rather than reported as a reference
   * the codebook has lost. Formatted by the caller, the way `emptyMessage` is:
   * the words belong to whatever the choice is being made for, and that is the
   * module whose catalog contains them.
   */
  unavailableReason?: string;
  /**
   * Set beside `unavailableReason` when the only thing wrong with the attribute
   * is the kind of answer it records. Such attributes are listed after the
   * ones ruled out for a reason about this setting (another stage uses it,
   * another field on this stage collects it): those are the attributes a
   * researcher might have expected to choose, and the ones whose reason they
   * most need to read.
   */
  unavailableForType?: boolean;
  /**
   * A short note under the attribute, beside a warning dot, and read as part
   * of its name, after the attribute's own: that the text being written
   * requires it and does not include it yet, say. Formatted by the caller, as
   * `unavailableReason` is.
   */
  marker?: string;
}>;

export type VariablePickerFieldProps = CreateFormFieldProps<
  string,
  'div',
  {
    options?: readonly VariablePickerOption[];
    /**
     * Said when there are no attributes at all: in place of the control when
     * nothing may be created either, and otherwise under it while nothing is
     * chosen. Not said when there are attributes and none of them can be
     * chosen here; the list says that for itself, and each attribute says
     * why.
     */
    emptyMessage?: string;
    /**
     * Every attribute of the type this would create on, for the create row to
     * check a typed name against before asking.
     *
     * Wider than `options`, which the caller has already narrowed to the kinds
     * of answer it can use: a name is taken by a date attribute just as firmly
     * as by a text one, and another attribute's export columns can be what a
     * name would collide with. Passed in rather than read here, for the reason
     * `options` is — the picker is handed what a section knows, and a field
     * that read the protocol for itself could not be rendered outside one.
     */
    nameScope?: VariableNameScope;
    /**
     * The kind of answer the attribute this creates will record, where the
     * caller already knows it. Named on the create row, and judged against the
     * export's columns: a layout attribute exports several, named after it.
     */
    newVariableType?: string;
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
     * and both answers arrive after the researcher has chosen the row, so the
     * list waits for one before deciding what to do with the typed name.
     */
    onCreateOption?: (variableName: string) => Promise<CreateOptionOutcome>;
    /**
     * Told which attribute the researcher chose from the list, after the value
     * has been written.
     *
     * Only a choice made in the list: an attribute created from it reaches the
     * caller through its own create, and a value that arrives any other way (a
     * saved stage opening, a re-render) is not a choice. For a caller whose
     * slot has something that follows the attribute and must be set once, when
     * the researcher binds it, and left alone when the stage is merely opened.
     */
    onSelectExisting?: (variableId: string) => void;
    /** See `VariablePickerList`. */
    groups?: VariablePickerListProps['groups'];
    /** See `VariablePickerList`. */
    unavailableDisplay?: VariablePickerListProps['unavailableDisplay'];
    /** See `VariablePickerList`. */
    actions?: VariablePickerListProps['actions'];
    /** See `VariablePickerList`; also draws the held attribute. */
    optionPill?: VariablePickerListProps['optionPill'];
  }
>;

const messages = defineMessages({
  placeholder: {
    id: 'protocolBuilder.variablePicker.placeholder',
    defaultMessage: 'Select an attribute',
    description:
      'Shown inside the attribute control while no attribute has been chosen. Pressing the control opens a list of the attributes to choose from. An attribute is a variable that the protocol’s codebook defines for a node type, an edge type or the interview participant.',
  },
  noneAvailableField: {
    id: 'protocolBuilder.variablePicker.noneAvailableField',
    defaultMessage:
      'None of the existing attributes can be used here. Open the list to see why.',
    description:
      'Shown under an attribute control while nothing is chosen, when the codebook has attributes but none of them can be chosen for this setting. Opening the list shows each attribute with the reason it cannot be used.',
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
   * has ruled out and left out of the list. A caller that KNOWS which it is
   * keeps the option and gives it an `unavailableReason`, which is shown
   * instead.
   */
  missingOptionLabel: {
    id: 'protocolBuilder.variablePicker.missingOptionLabel',
    defaultMessage: '{attributeId} — this attribute is not available here',
    description:
      'Name of the one option standing for an attribute that is not among the ones this control was given to offer. attributeId is the raw stored identifier — there is no name to show, because no definition of it reached this control.',
  },
  missingAttribute: {
    id: 'protocolBuilder.variablePicker.missingAttribute',
    defaultMessage: 'This attribute is not available here. Choose another one.',
    description:
      'Shown under the control when the attribute a researcher’s stored choice names is not among the ones this control was given to offer — it may have been deleted from the protocol’s codebook, or ruled out by whatever the choice is being made for. Worded for what the control actually knows: it is handed a list of attributes and a stored choice, and cannot tell those two cases apart.',
  },
  createdUnassigned: {
    id: 'protocolBuilder.variablePicker.createdUnassigned',
    defaultMessage:
      '“{variableName}” was added to the codebook, but it has not been selected here.',
    description:
      'Notice under the control, shown when the attribute the researcher named was added to the codebook — the protocol’s definition of what an interview records — but whatever they were creating it for did not take it. variableName is the name they typed and is not translated.',
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
 * refusal is ABOUT the name that was typed, so the list stays open with the
 * name still in the search box to be corrected. An attribute that EXISTS
 * closes the list whatever happened next: asking again would ask the codebook
 * for a name it already has, and the duplicate-name refusal that comes back is
 * about something the researcher did not do.
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
   * list stays open on it.
   *
   * The reason comes with it where the caller has one, and is shown on the
   * create row: the name was typed in the list, so that is where the
   * researcher is looking.
   */
  | Readonly<{ status: 'refused'; message?: string }>;

/**
 * What this control has left to say once a create has ended.
 *
 * Said on the FIELD rather than in the list, because the list has closed by
 * the time either is true. A create the codebook `refused` is not among them:
 * the list stays open with the name to correct, and the reason is shown on the
 * create row.
 */
type FieldNotice =
  /** The attribute exists, and nothing here was given it. */
  | Readonly<{ kind: 'unassigned'; variableName: string }>
  /**
   * The create ended without an answer at all — the caller broke the promise
   * `onCreateOption` makes, so nothing is known to exist and nobody has told
   * the researcher anything.
   */
  | Readonly<{ kind: 'failed' }>;

/**
 * The spring fresco-ui's choice controls select with (`selectionSpring` in
 * `Boolean.tsx` and `RichSelectGroup.tsx`), and their shorter duration for
 * what is being let go of, so a chosen attribute arrives as a chosen radio
 * button or Boolean option does.
 */
const SELECTION_SPRING = {
  type: 'spring',
  duration: 0.3,
  bounce: 0.15,
} as const;
const RELEASE_SPRING = { ...SELECTION_SPRING, duration: 0.15 } as const;

/**
 * How what the trigger shows comes and goes.
 *
 * Only a choice made in this field moves anything: a value already held when
 * the field mounts, or changed from outside, is simply drawn. The new pill
 * rises into place as the old one rises out, both in the one grid cell, so
 * the trigger keeps its size throughout; scale is about the pill's own centre
 * and the movement is vertical, so nothing depends on the reading direction.
 * Under reduced motion they only fade.
 *
 * `custom` is whether the change is one being shown, and is passed through
 * `AnimatePresence` so that it reaches the value leaving as well as the one
 * arriving.
 */
type SlotMotion = Readonly<{ shown: boolean; reduced: boolean }>;
const SLOT_VARIANTS = {
  arriving: ({ reduced }: SlotMotion) =>
    reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 6 },
  settled: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: SELECTION_SPRING,
  },
  leaving: ({ shown, reduced }: SlotMotion) => {
    if (!shown) return { opacity: 0, transition: { duration: 0 } };
    return reduced
      ? { opacity: 0, transition: RELEASE_SPRING }
      : { opacity: 0, scale: 0.95, y: -6, transition: RELEASE_SPRING };
  },
};

const isShownChange = (data: unknown): boolean =>
  typeof data === 'object' &&
  data !== null &&
  'shown' in data &&
  data.shown === true;

/**
 * One thing the trigger shows: the held attribute's pill, or the
 * placeholder.
 *
 * Hidden from assistive technology while it leaves, because the trigger is
 * named by the slot they share, and the outgoing choice is no longer the
 * value.
 */
function TriggerValue({
  motionState,
  arrives,
  children,
}: Readonly<{
  motionState: SlotMotion;
  /** Whether this value's arrival is a change being shown. */
  arrives: boolean;
  children: ReactNode;
}>) {
  const isPresent = useIsPresent();
  // What `AnimatePresence` says about the change now, which a value that is
  // leaving reads in place of the props it was last drawn with.
  const leaving: unknown = usePresenceData();
  // A change from outside is drawn at once: the value it replaces is hidden
  // in the same render rather than one frame later, when its exit ends.
  const dropped = !isPresent && !isShownChange(leaving);
  return (
    <motion.span
      aria-hidden={isPresent ? undefined : true}
      // Read by tests: the one statement that this value's arrival was
      // animated, which a test cannot see from the end state.
      data-animated-arrival={arrives ? '' : undefined}
      custom={motionState}
      variants={SLOT_VARIANTS}
      initial={arrives ? 'arriving' : false}
      animate="settled"
      exit="leaving"
      className={cx(
        'col-start-1 row-start-1 flex max-w-full min-w-0 items-center justify-self-start',
        dropped && 'invisible',
      )}
    >
      {children}
    </motion.span>
  );
}

/**
 * Chooses one codebook attribute and, where the caller allows it, creates the
 * one that is missing.
 *
 * A select box that opens a list anchored to it, with a search box at the top
 * of the list. The codebooks this searches are long: a node type carried
 * through a few studies has dozens of attributes of one kind. So the field
 * shows the one thing that matters while it is closed — which attribute is
 * chosen, and what kind of answer it records — and the search box narrows the
 * list by a fuzzy match, so "mrd" finds "married".
 *
 * It takes its options rather than reading a codebook, because what may be
 * chosen depends on what the choice is FOR: a rule can use the attributes it
 * can compare, a form field cannot use the ones its siblings already collect,
 * a pedigree slot cannot use the ones whose values do not fit. Callers list
 * every attribute and rule out the rest with an `unavailableReason` (see
 * `codebook/attributeAvailability.ts`); those are listed under "Not available
 * here", or in place with their reason (see `VariablePickerList`), and choosing
 * one explains why instead of choosing it.
 *
 * The attribute a researcher wants is often the one they have only just
 * thought of, so a caller that knows what a new attribute would be for passes
 * `onCreateOption`, and the list's first row then offers to create the name
 * typed into the search box.
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export default function VariablePickerField(props: VariablePickerFieldProps) {
  const {
    id,
    name,
    value,
    onChange,
    onBlur,
    onFocus,
    options = [],
    groups,
    unavailableDisplay,
    actions,
    optionPill,
    emptyMessage,
    nameScope,
    newVariableType,
    onCreateOption,
    onSelectExisting,
    disabled = false,
    readOnly = false,
    className,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-labelledby': ariaLabelledBy,
  } = props;
  const intl = useAppIntl();
  const scopeId = useId();
  const valueId = `${scopeId}-value`;
  const typeId = `${scopeId}-type`;
  const reasonId = `${scopeId}-reason`;

  const locked = disabled || readOnly;
  const [requestedOpen, setRequestedOpen] = useState(false);
  /**
   * The list closes as soon as the field stops taking answers. A save that is
   * refused because someone else holds the stage leaves the form mounted and
   * every field in it disabled, and a list left open over a field that refuses
   * every answer would offer choices the host will only refuse.
   */
  const open = requestedOpen && !locked;

  /**
   * What is left to say about the create that has just happened, held for as
   * long as the notice about it is on screen.
   */
  const [notice, setNotice] = useState<FieldNotice | undefined>(undefined);

  /**
   * Whether a choice made in this field has yet to reach the value. The value
   * comes back through the caller — at once for a choice, whenever the
   * codebook answers for a create — so the arrival is recognised when it
   * happens, not when it is asked for.
   */
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  /**
   * The value the trigger shows, whether it got there by a choice made in
   * this field, and how many such choices there have been, which keys the
   * trigger's confirmation so that each choice plays it once. A value held
   * when the field mounts, or changed from outside, is not a choice made here.
   */
  const [shown, setShown] = useState<
    Readonly<{ value: string | undefined; chosenHere: boolean; count: number }>
  >({ value, chosenHere: false, count: 0 });
  if (value !== shown.value) {
    // Adjusting state while rendering, as React documents for state that
    // follows a changed prop: in an effect, the new value would be drawn once
    // without its arrival before the arrival started.
    setShown({
      value,
      chosenHere: awaitingChoice,
      count: shown.count + (awaitingChoice ? 1 : 0),
    });
    setAwaitingChoice(false);
  }
  const arrived = shown.chosenHere && shown.value === value;
  const prefersReducedMotion = usePrefersReducedMotion() === true;
  const slotMotion: SlotMotion = {
    shown: arrived,
    reduced: prefersReducedMotion,
  };

  const everyOption = allPickerOptions({ options, groups });
  const selected = everyOption.find((option) => option.value === value);
  const held = value !== undefined && value !== '';
  const isMissing = held && selected === undefined;
  const heldReason = selected?.unavailableReason;
  const anyAvailable = everyOption.some(
    (option) => option.unavailableReason === undefined,
  );
  const anyActions =
    (actions?.length ?? 0) > 0 ||
    (groups ?? []).some((group) => (group.actions?.length ?? 0) > 0);

  /**
   * Nothing to choose, nothing to create and nothing held, which is the one
   * state with no list worth opening.
   *
   * A HELD value keeps the control on screen whatever else is true: the
   * reference the researcher has to resolve is the one thing this field knows,
   * and replacing the control with "there is nothing to choose from" would
   * hide it and leave no way to change it.
   */
  const nothingToDo =
    !held &&
    everyOption.length === 0 &&
    onCreateOption === undefined &&
    !anyActions;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && locked) return;
      setRequestedOpen(nextOpen);
    },
    [locked],
  );

  const { onTriggerKeyDown } = useComboboxTriggerEscape({
    open,
    onOpenChange: handleOpenChange,
  });

  /**
   * The caller's create, with what this field says about it afterwards. The
   * list decides what happens to itself; the field keeps what is left to say
   * once the list has closed.
   */
  const createOption = useCallback(
    async (variableName: string): Promise<CreateOptionOutcome> => {
      if (onCreateOption === undefined) return { status: 'refused' };
      setNotice(undefined);
      // The caller may give this field the new attribute before it answers.
      setAwaitingChoice(true);
      try {
        const outcome = await onCreateOption(variableName);
        if (outcome.status !== 'created') setAwaitingChoice(false);
        if (outcome.status === 'unassigned') {
          setNotice({ kind: 'unassigned', variableName });
        }
        return outcome;
      } catch (error) {
        // A caller that throws — synchronously, or by rejecting, or by
        // answering with something that is not an outcome at all — has broken
        // the promise `onCreateOption` makes: nothing is known to exist, and
        // nobody has said anything about it. Said on the FIELD, because the
        // list closes and the control the researcher acts on next is this one.
        setAwaitingChoice(false);
        setNotice({ kind: 'failed' });
        throw error;
      }
    },
    [onCreateOption],
  );

  const handleSelect = (next: string) => {
    if (locked) return;
    setNotice(undefined);
    if (next !== value) setAwaitingChoice(true);
    onChange?.(next);
    onSelectExisting?.(next);
  };

  /**
   * Keeps the list's own focus changes from reading as the researcher leaving
   * this field.
   *
   * The popup is portalled out of this subtree, but its React events still
   * bubble through the owner tree — so without this the search box taking
   * focus would validate a field the researcher is in the middle of answering.
   * Focus coming back to the trigger when the list closes is not a blur
   * either.
   */
  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget;
      if (
        open ||
        (next instanceof Node && event.currentTarget.contains(next)) ||
        (next instanceof Element &&
          next.closest(`[${VARIABLE_PICKER_POPUP_MARKER}]`))
      ) {
        event.stopPropagation();
        return;
      }
      onBlur?.(event);
    },
    [onBlur, open],
  );

  const heldTypeDescription =
    selected?.type === undefined ? undefined : selected.type;
  const triggerDescribedBy =
    [
      ariaDescribedBy,
      heldTypeDescription === undefined ? undefined : typeId,
      isMissing || heldReason !== undefined ? reasonId : undefined,
    ]
      .filter((part) => part !== undefined)
      .join(' ') || undefined;

  const heldPill = (() => {
    if (isMissing && value !== undefined) {
      return (
        <VariablePill
          missing
          size="md"
          name={intl.formatMessage(messages.missingOptionLabel, {
            attributeId: value,
          })}
        />
      );
    }
    if (selected === undefined) return undefined;
    return <VariablePill {...optionPillProps(selected, optionPill)} />;
  })();

  const trigger = (
    <Combobox.Trigger
      id={id}
      onKeyDown={onTriggerKeyDown}
      aria-labelledby={
        ariaLabelledBy === undefined
          ? undefined
          : `${ariaLabelledBy} ${valueId}`
      }
      aria-describedby={triggerDescribedBy}
      aria-invalid={ariaInvalid || undefined}
      // Not `disabled`: a disabled button cannot take focus, and a save that
      // is refused while the form is busy sends focus here (every field is
      // disabled for as long as a save is in flight). The list refuses to
      // open while the field takes no answers.
      aria-disabled={disabled || undefined}
      aria-readonly={readOnly || undefined}
      // Names this control as where a refused save sends focus for this
      // field: it resolves a "choose an attribute" error.
      data-field-focus-target=""
      className={comboboxTriggerVariants({
        state: getInputState({
          disabled,
          readOnly,
          'aria-invalid': ariaInvalid === true,
        }),
        className: cx('relative w-full', heldPill !== undefined && 'ps-1.5'),
      })}
    >
      {/* One grid cell, so that a value leaving and the value arriving
          share it while they cross. */}
      <span
        id={valueId}
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] items-center text-start"
      >
        <AnimatePresence initial={false} custom={slotMotion}>
          {heldPill === undefined ? (
            <TriggerValue
              key="placeholder"
              motionState={slotMotion}
              arrives={false}
            >
              <span className="text-input-contrast/70 truncate italic">
                {intl.formatMessage(messages.placeholder)}
              </span>
            </TriggerValue>
          ) : (
            <TriggerValue
              key={`${isMissing ? 'missing' : 'held'}:${value}`}
              motionState={slotMotion}
              arrives={arrived}
            >
              {heldPill}
            </TriggerValue>
          )}
        </AnimatePresence>
      </span>
      <Combobox.Icon className="shrink-0">
        <ChevronsUpDown aria-hidden className="h-[1.2em] w-[1.2em]" />
      </Combobox.Icon>
      {/* The trigger's border confirms a choice made here: it flashes in
          the colour a chosen row's check mark takes. Keyed by the choice, so
          each one plays it once and nothing else does. */}
      {arrived && heldPill !== undefined && (
        <motion.span
          key={shown.count}
          aria-hidden
          data-choice-confirmation=""
          className="ring-sea-green pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.35, times: [0, 0.3, 1] }}
        />
      )}
    </Combobox.Trigger>
  );

  return (
    <div
      data-name={name}
      onBlur={handleBlur}
      onFocus={onFocus}
      className={cx(
        'flex w-full min-w-0 flex-col items-start gap-2',
        className,
      )}
    >
      {nothingToDo ? (
        <p
          id={id}
          aria-describedby={ariaDescribedBy}
          className="w-full py-6 text-center text-sm text-current/70 italic"
        >
          {emptyMessage ?? intl.formatMessage(emptyAttributeListMessage)}
        </p>
      ) : (
        <>
          <VariablePickerList
            trigger={trigger}
            open={open}
            onOpenChange={handleOpenChange}
            options={options}
            {...(groups === undefined ? {} : { groups })}
            {...(unavailableDisplay === undefined
              ? {}
              : { unavailableDisplay })}
            {...(actions === undefined ? {} : { actions })}
            {...(optionPill === undefined ? {} : { optionPill })}
            {...(value === undefined ? {} : { value })}
            onSelect={handleSelect}
            {...(onCreateOption === undefined
              ? {}
              : { onCreateOption: createOption })}
            {...(nameScope === undefined ? {} : { nameScope })}
            {...(newVariableType === undefined ? {} : { newVariableType })}
            {...(emptyMessage === undefined ? {} : { emptyMessage })}
            {...(ariaLabelledBy === undefined
              ? {}
              : { 'aria-labelledby': ariaLabelledBy })}
          />
          {/* Said where it is seen without opening the list, while nothing
              is chosen and nothing in the list can be: the caller's sentence
              when there are no attributes at all, and otherwise that the ones
              there are cannot be used here. */}
          {heldPill === undefined &&
            !anyAvailable &&
            (everyOption.length > 0 || emptyMessage !== undefined) && (
              <p className="text-sm text-current/70">
                {everyOption.length > 0
                  ? intl.formatMessage(messages.noneAvailableField)
                  : emptyMessage}
              </p>
            )}
          {heldTypeDescription !== undefined && (
            <span id={typeId} hidden lang="en">
              {typeDescriptionFor(heldTypeDescription)}
            </span>
          )}
          {isMissing && (
            <p id={reasonId} className="text-destructive-ink text-sm">
              {intl.formatMessage(messages.missingAttribute)}
            </p>
          )}
          {heldReason !== undefined && (
            <p id={reasonId} className="text-destructive-ink text-sm">
              {heldReason}
            </p>
          )}
          {/* Always mounted, so a screen reader is watching this region before
              the notice appears: a live region added to the page at the same
              moment as its own content is not reliably announced.

              The `Alert` inside it is presentational for exactly that reason.
              Its `info` variant is a `role="status"` of its own — and its
              `destructive` variant a `role="alert"` — so either would be a
              second live region inserted into this one at the moment its
              content appears. */}
          <output aria-live="polite" className="block w-full empty:hidden">
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
          </output>
        </>
      )}
    </div>
  );
}
