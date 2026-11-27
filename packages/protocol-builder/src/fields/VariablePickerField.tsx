import { Combobox } from '@base-ui/react/combobox';
import {
  Check,
  ChevronsUpDown,
  Info,
  Plus,
  SearchIcon,
  TriangleAlert,
} from 'lucide-react';
import {
  AnimatePresence,
  motion,
  useIsPresent,
  usePresenceData,
} from 'motion/react';
import {
  type ComponentPropsWithRef,
  type FocusEvent,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useState,
} from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { comboboxTriggerVariants } from '@codaco/fresco-ui/form/fields/Combobox/shared';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { getInputState } from '@codaco/fresco-ui/form/utils/getInputState';
import { useComboboxTriggerEscape } from '@codaco/fresco-ui/hooks/useComboboxTriggerEscape';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Spinner from '@codaco/fresco-ui/Spinner';
import { dropdownItemVariants } from '@codaco/fresco-ui/styles/controlVariants';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { fuzzyFilter } from '@codaco/fresco-ui/utils/fuzzyMatch';
import type { VariableType } from '@codaco/protocol-validation';
import {
  normalizeCodebookName,
  normalizeForComparison,
} from '@codaco/shared-consts';

import { createVariableRefused } from '../codebook/useCodebookVariableEdits.ts';
import { variableTypeLabel } from '../codebook/variableTypeLabels.ts';
import { protocolAuthoringLinks } from '../interfaces/documentation.ts';
import { isVariableType, type RuleAttributeType } from '../rules/operators.ts';
import AttributePill, { AttributeTypeMark } from './AttributePill.tsx';
import {
  variableNameRefusal,
  type VariableNameScope,
} from './variableNameRules.ts';

export type VariablePickerOption = Readonly<{
  value: string;
  label: string;
  /** The kind of answer an attribute records, or `'layout'` for a layout. */
  type?: RuleAttributeType;
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
     * export's columns.
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
    /**
     * Why a name typed in the search box cannot be created, in place of the
     * rule for an attribute's name: for a picker whose create row adds
     * something other than an attribute.
     */
    nameRefusal?: (typedName: string) => string | undefined;
    /**
     * The sentences this control says, where the thing it chooses is not an
     * attribute. Module-level, so the control is not re-rendered for a new
     * object every time its caller is.
     */
    wording?: PickerWording;
    /**
     * What a screen reader calls the search box and the list (and the popup,
     * when nothing labels it), which stay English in every language, for a
     * picker of something other than attributes.
     */
    accessibleNames?: AccessibleNames;
  }
>;

type AccessibleNames = Readonly<{ create: string; only: string; list: string }>;

const ATTRIBUTE_ACCESSIBLE_NAMES: AccessibleNames = {
  create: 'Find or create an attribute',
  only: 'Find an attribute',
  list: 'Attributes',
};

const messages = defineMessages({
  placeholder: {
    id: 'protocolBuilder.variablePicker.placeholder',
    defaultMessage: 'Select an attribute',
    description:
      'Shown inside the attribute control while no attribute has been chosen. Pressing the control opens a list of the attributes to choose from. An attribute is a variable that the protocol’s codebook defines for a node type, an edge type or the interview participant.',
  },
  emptyState: {
    id: 'protocolBuilder.variablePicker.emptyState',
    defaultMessage: 'No attributes are available to choose from.',
    description:
      'Shown in place of the control when nothing can be picked — the caller offered no attributes at all and does not allow one to be created. An attribute is a variable the protocol’s codebook defines. Callers that can say something more specific pass their own sentence instead.',
  },
  searchPlaceholder: {
    id: 'protocolBuilder.variablePicker.searchPlaceholder',
    defaultMessage: 'Find or create an attribute…',
    description:
      'Placeholder in the search box at the top of the attribute list, where this control allows a new attribute to be created.',
  },
  searchOnlyPlaceholder: {
    id: 'protocolBuilder.variablePicker.searchOnlyPlaceholder',
    defaultMessage: 'Find an attribute…',
    description:
      'Placeholder in the search box at the top of the attribute list, where this control only chooses from attributes that already exist.',
  },
  unavailableHeading: {
    id: 'protocolBuilder.variablePicker.unavailableHeading',
    defaultMessage: 'Not available here',
    description:
      'Heading in the attribute list, above the attributes that exist but cannot be chosen for this setting. Choosing one of them shows a sentence saying why.',
  },
  noneAvailable: {
    id: 'protocolBuilder.variablePicker.noneAvailable',
    defaultMessage:
      'None of the attributes below can be used here. Choose one to see why.',
    description:
      'Shown at the top of the attribute list when the codebook has attributes but none of them can be chosen for this setting, and this control does not allow an attribute to be created. Choosing one of the attributes shows a sentence saying why it cannot be used.',
  },
  noneAvailableCreate: {
    id: 'protocolBuilder.variablePicker.noneAvailableCreate',
    defaultMessage:
      'None of the attributes below can be used here. Type a name above to create a new attribute, or choose one below to see why it cannot be used.',
    description:
      'Shown at the top of the attribute list when the codebook has attributes but none of them can be chosen for this setting, and this control allows a new attribute to be created from the search box above the list.',
  },
  noneAvailableField: {
    id: 'protocolBuilder.variablePicker.noneAvailableField',
    defaultMessage:
      'None of the existing attributes can be used here. Open the list to see why.',
    description:
      'Shown under an attribute control while nothing is chosen, when the codebook has attributes but none of them can be chosen for this setting. Opening the list shows each attribute with the reason it cannot be used.',
  },
  noMatches: {
    id: 'protocolBuilder.variablePicker.noMatches',
    defaultMessage: 'No attributes match “{query}”.',
    description:
      'Shown in the attribute list when no attribute matches what the researcher typed in the search box, and this control does not allow an attribute to be created. query is what they typed and is not translated.',
  },
  firstAttribute: {
    id: 'protocolBuilder.variablePicker.firstAttribute',
    defaultMessage:
      'Nothing has been recorded about this type yet. Type a name above to create the first attribute, and see the <docs>documentation on attribute naming</docs> for what makes a good one.',
    description:
      'Shown in the attribute list when the protocol’s codebook contains nothing this control can offer and the researcher may create an attribute. The text inside the docs tag is the words of a link to the Network Canvas documentation and must read as part of the sentence.',
  },
  createRow: {
    id: 'protocolBuilder.variablePicker.createRow',
    defaultMessage: 'Create “{attributeName}”',
    description:
      'First row of the attribute list, offering to add an attribute under the name the researcher has typed into the search box. attributeName is what they typed and is not translated.',
  },
  createRowBusy: {
    id: 'protocolBuilder.variablePicker.createRowBusy',
    defaultMessage: 'Creating “{attributeName}”…',
    description:
      'The first row of the attribute list while the attribute the researcher asked for is being added to the codebook — the protocol’s definition of what an interview records. attributeName is the name they typed and is not translated.',
  },
  createRowType: {
    id: 'protocolBuilder.variablePicker.createRowType',
    defaultMessage: 'New {typeName} attribute',
    description:
      'Second line of the row that creates an attribute, naming the kind of answer the new attribute will record. typeName is the translated name of that kind, such as Boolean, Text or Date, as the codebook editor names it.',
  },
  createRowUntyped: {
    id: 'protocolBuilder.variablePicker.createRowUntyped',
    defaultMessage: 'New attribute',
    description:
      'Second line of the row that creates an attribute, when the kind of answer that the new attribute will record is chosen later.',
  },
  createRowInvalidName: {
    id: 'protocolBuilder.variablePicker.createRowInvalidName',
    defaultMessage: 'An attribute cannot be named “{attributeName}”',
    description:
      'First row of the attribute list, switched off because the name typed into the search box cannot be used. A second line below it gives the reason. attributeName is what the researcher typed and is not translated.',
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
 * Replacement sentences for a picker of something other than attributes, each
 * taking the same values as the sentence it replaces.
 */
export type PickerWording = Partial<
  Record<keyof typeof messages, MessageDescriptor>
>;

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
 * The value of the create row. No attribute id can be it: a protocol mints ids
 * from printable characters, and this one starts with a NUL.
 */
const CREATE_VALUE = '\u0000create';

/**
 * Marks the popup, so the field's blur handling and tests can tell the
 * picker's own popup from any dialog it is opened inside.
 */
const POPUP_MARKER = 'data-attribute-picker-popup';

const ITEM_CLASSES = cx(
  dropdownItemVariants(),
  'items-start gap-2 py-1.5',
  // An unavailable row is reachable with the arrow keys, so it keeps the
  // highlight, but it does not invite a click with a pointer cursor.
  'aria-disabled:cursor-default',
);

/**
 * The link inside the invitation to make a first attribute.
 *
 * A tag inside the sentence rather than markup around a fragment of it, so a
 * translator moves the whole clause with its link. Defined once at module
 * level: a tag function written inline is a component defined during render.
 */
const firstAttributeTags = {
  docs: (chunks: ReactNode) => (
    <NativeLink
      key="docs"
      href={protocolAuthoringLinks.attributeNaming}
      target="_blank"
      rel="noopener noreferrer"
    >
      {chunks}
    </NativeLink>
  ),
};

/**
 * The English name of a kind of answer, for screen-reader text, which stays
 * English in every language. Written out rather than read from the codebook
 * editor's message descriptors: an app build compiles a descriptor's
 * `defaultMessage` to an AST, so reading it there yields no string. The names
 * match the English of `variableTypeLabels.ts`.
 */
const ENGLISH_TYPE_NAMES: Record<VariableType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  ordinal: 'Ordinal',
  categorical: 'Categorical',
  scalar: 'Scalar',
  datetime: 'Date',
  location: 'Location',
};

const englishTypeName = (type: VariableType): string =>
  ENGLISH_TYPE_NAMES[type] ?? type;

/** What a screen reader is told about the kind of answer an attribute records. */
const typeDescriptionFor = (type: RuleAttributeType | undefined) => {
  if (type === undefined) return undefined;
  if (type === 'layout') return 'Layout';
  return `Attribute type: ${englishTypeName(type)}`;
};

/** The create that is waiting for the codebook, or that it refused. */
type CreateState =
  | Readonly<{ kind: 'busy'; name: string }>
  | Readonly<{ kind: 'refused'; name: string; message: string }>
  | undefined;

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
 * here", and choosing one explains why instead of choosing it.
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
    emptyMessage,
    nameScope,
    newVariableType,
    onCreateOption,
    onSelectExisting,
    nameRefusal,
    wording,
    accessibleNames = ATTRIBUTE_ACCESSIBLE_NAMES,
    disabled = false,
    readOnly = false,
    className,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-labelledby': ariaLabelledBy,
  } = props;
  const intl = useAppIntl();
  const words = useMemo(
    () => (wording === undefined ? messages : { ...messages, ...wording }),
    [wording],
  );
  const portalContainer = usePortalContainer();
  const scopeId = useId();
  const valueId = `${scopeId}-value`;
  const typeId = `${scopeId}-type`;
  const reasonId = `${scopeId}-reason`;
  const listId = `${scopeId}-list`;
  const createTitleId = `${scopeId}-create-title`;
  const createDetailId = `${scopeId}-create-detail`;

  const locked = disabled || readOnly;
  const [requestedOpen, setRequestedOpen] = useState(false);
  /**
   * The list closes as soon as the field stops taking answers. A save that is
   * refused because someone else holds the stage leaves the form mounted and
   * every field in it disabled, and a list left open over a field that refuses
   * every answer would offer choices the host will only refuse.
   */
  const open = requestedOpen && !locked;

  const [query, setQuery] = useState('');
  /** The unavailable attribute whose reason is shown, if any. */
  const [revealed, setRevealed] = useState<string | undefined>(undefined);
  const [create, setCreate] = useState<CreateState>(undefined);
  const busy = create?.kind === 'busy';
  /** What the polite region below says: a reason, or the state of a create. */
  const [announcement, setAnnouncement] = useState('');
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

  const selected = options.find((option) => option.value === value);
  const held = value !== undefined && value !== '';
  const isMissing = held && selected === undefined;
  const heldReason = selected?.unavailableReason;

  const sorted = useMemo(
    () =>
      options.toSorted((first, second) =>
        first.label.localeCompare(second.label, intl.locale),
      ),
    [intl.locale, options],
  );
  const matching = useMemo(
    () => fuzzyFilter(sorted, query, (option) => option.label, intl.locale),
    [intl.locale, query, sorted],
  );
  const available = matching.filter(
    (option) => option.unavailableReason === undefined,
  );
  // Attributes ruled out for a reason about this setting first, then those
  // ruled out only for their type; each group stays in name order.
  const unavailable = matching
    .filter((option) => option.unavailableReason !== undefined)
    .toSorted(
      (first, second) =>
        Number(first.unavailableForType === true) -
        Number(second.unavailableForType === true),
    );
  const anyAvailable = options.some(
    (option) => option.unavailableReason === undefined,
  );

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
    !held && options.length === 0 && onCreateOption === undefined;

  // What the codebook would be asked to store: the name as typed, trimmed and
  // canonical. A leading space is not a different attribute, and a search of
  // spaces alone has nothing to create.
  const typedName = normalizeCodebookName(query);
  /**
   * Whether a listed attribute already goes by the typed name — asked the
   * codebook's way, so `Name` finds `name` and a decomposed `café` finds the
   * precomposed one. There is nothing to create under a name that is already
   * in the list.
   */
  const exactMatch = useMemo(() => {
    const typed = normalizeForComparison(typedName);
    return options.some(
      (option) => normalizeForComparison(option.label) === typed,
    );
  }, [options, typedName]);
  const offersCreate =
    onCreateOption !== undefined && typedName !== '' && !exactMatch;
  /**
   * Why the typed name cannot be created, or `undefined` while it can.
   *
   * Asked of the whole type rather than of the listed attributes, and against
   * the codebook's own rule: the codebook is what refuses the write, and a row
   * that offered a create the codebook would refuse would spend a round trip
   * to say so.
   */
  const invalidName = useMemo(
    () =>
      offersCreate
        ? nameRefusal === undefined
          ? variableNameRefusal(typedName, {
              intl,
              ...(nameScope === undefined ? {} : { scope: nameScope }),
              ...(newVariableType === undefined
                ? {}
                : { type: newVariableType }),
            })
          : nameRefusal(typedName)
        : undefined,
    [intl, nameRefusal, nameScope, newVariableType, offersCreate, typedName],
  );

  const close = useCallback(() => {
    setRequestedOpen(false);
    setQuery('');
    setRevealed(undefined);
    setCreate(undefined);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        if (locked) return;
        setRequestedOpen(true);
        return;
      }
      // The answer decides what this list does next, so it is not dismissed
      // while a create is with the codebook. The write completes regardless,
      // and leaving would look like calling it off.
      if (busy) return;
      close();
    },
    [busy, close, locked],
  );

  const { onTriggerKeyDown } = useComboboxTriggerEscape({
    open,
    onOpenChange: handleOpenChange,
  });

  const requestCreate = useCallback(async () => {
    if (onCreateOption === undefined || invalidName !== undefined || busy) {
      return;
    }
    const variableName = typedName;
    setNotice(undefined);
    // The caller may give this field the new attribute before it answers.
    setAwaitingChoice(true);
    setCreate({ kind: 'busy', name: variableName });
    setAnnouncement(
      intl.formatMessage(words.createRowBusy, {
        attributeName: variableName,
      }),
    );
    try {
      const outcome = await onCreateOption(variableName);
      // A refusal is ABOUT this name, so the list stays open with it still in
      // the search box, and the reason is shown on the row it was asked from.
      if (outcome.status === 'refused') {
        setAwaitingChoice(false);
        setAnnouncement(outcome.message ?? '');
        setCreate(
          outcome.message === undefined
            ? undefined
            : { kind: 'refused', name: variableName, message: outcome.message },
        );
        return;
      }
      // Every other answer means the codebook now has it, and asking for it a
      // second time would be refused for a duplicate name the researcher never
      // chose to ask for.
      if (outcome.status === 'unassigned') {
        setAwaitingChoice(false);
        setNotice({ kind: 'unassigned', variableName });
      }
      setAnnouncement('');
      close();
    } catch {
      // A caller that throws — synchronously, or by rejecting, or by answering
      // with something that is not an outcome at all — has broken the promise
      // `onCreateOption` makes: nothing is known to exist, and nobody has said
      // anything about it. Said on the FIELD, because the list closes and the
      // control the researcher acts on next is this one.
      setAwaitingChoice(false);
      setNotice({ kind: 'failed' });
      setAnnouncement('');
      close();
    }
  }, [
    busy,
    close,
    intl,
    invalidName,
    onCreateOption,
    typedName,
    words.createRowBusy,
  ]);

  const handleValueChange = (
    next: string | null,
    details: Combobox.Root.ChangeEventDetails,
  ) => {
    // The list keeps its own choice out of the field: every outcome below is
    // decided here, and Base UI is told what happened only by the value.
    details.cancel();
    if (busy || locked || next === null) return;
    if (next === CREATE_VALUE) {
      void requestCreate();
      return;
    }
    const option = options.find((candidate) => candidate.value === next);
    if (option?.unavailableReason !== undefined) {
      // Base UI does nothing at all for a `disabled` item, so an unavailable
      // row is only `aria-disabled`, and choosing it is answered here: nothing
      // is selected, and the reason is shown under its pill.
      setRevealed(option.value);
      setAnnouncement(option.unavailableReason);
      return;
    }
    setNotice(undefined);
    if (next !== value) setAwaitingChoice(true);
    onChange?.(next);
    onSelectExisting?.(next);
    close();
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
        (next instanceof Element && next.closest(`[${POPUP_MARKER}]`))
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
        <AttributePill
          missing
          className="h-9"
          name={intl.formatMessage(words.missingOptionLabel, {
            attributeId: value,
          })}
        />
      );
    }
    if (selected === undefined) return undefined;
    return (
      <AttributePill
        name={selected.label}
        type={selected.type}
        className="h-9"
      />
    );
  })();

  const attributeRow = (option: VariablePickerOption) => {
    const isUnavailable = option.unavailableReason !== undefined;
    const isRevealed = isUnavailable && revealed === option.value;
    const rowTypeId = `${scopeId}-${option.value}-type`;
    const rowReasonId = `${scopeId}-${option.value}-reason`;
    const typeDescription = typeDescriptionFor(option.type);
    const describedBy =
      [
        typeDescription === undefined ? undefined : rowTypeId,
        isRevealed ? rowReasonId : undefined,
      ]
        .filter((part) => part !== undefined)
        .join(' ') || undefined;
    return (
      <Combobox.Item
        key={option.value}
        value={option.value}
        aria-disabled={isUnavailable || busy || undefined}
        aria-describedby={describedBy}
        // What choosing this row would store, and the kind of answer it
        // records. The researcher's name for an attribute and the id the
        // protocol files it under are different things, and the list shows
        // only the first — so a test asserting on what a stage ends up holding
        // has nowhere else to read it.
        data-attribute-id={option.value}
        data-attribute-type={option.type}
        data-unavailable={isUnavailable || undefined}
        data-revealed={isRevealed || undefined}
        className={cx(ITEM_CLASSES, 'flex-col items-stretch')}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cx('min-w-0 flex-1', isUnavailable && 'opacity-50')}>
            <AttributePill
              name={option.label}
              type={option.type}
              className="h-9"
            />
          </span>
          <Combobox.ItemIndicator className="flex size-5 shrink-0 items-center justify-center">
            <Check aria-hidden className="size-5" />
          </Combobox.ItemIndicator>
        </span>
        {typeDescription !== undefined && (
          <span id={rowTypeId} hidden lang="en">
            {typeDescription}
          </span>
        )}
        {isRevealed && (
          // Hidden from the row's name, which is the attribute's own name, and
          // read as its description instead.
          <span
            id={rowReasonId}
            aria-hidden
            className="flex items-start gap-2 ps-1 pb-1 text-sm text-current/80"
          >
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{option.unavailableReason}</span>
          </span>
        )}
      </Combobox.Item>
    );
  };

  const createRow = () => {
    if (!offersCreate) return null;

    if (invalidName !== undefined) {
      return (
        <Combobox.Item
          value={CREATE_VALUE}
          aria-disabled
          aria-labelledby={createTitleId}
          aria-describedby={createDetailId}
          data-create-name={typedName}
          data-create-state="invalid"
          className={ITEM_CLASSES}
        >
          <TriangleAlert
            aria-hidden
            className="text-warning mt-0.5 size-5 shrink-0"
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span id={createTitleId} className="font-semibold break-words">
              {intl.formatMessage(words.createRowInvalidName, {
                attributeName: typedName,
              })}
            </span>
            <span id={createDetailId} className="text-sm text-current/70">
              {invalidName}
            </span>
          </span>
        </Combobox.Item>
      );
    }

    const typeName =
      newVariableType === undefined
        ? undefined
        : variableTypeLabel(newVariableType);
    const refusal =
      create?.kind === 'refused' && create.name === typedName
        ? create.message
        : undefined;
    return (
      <Combobox.Item
        value={CREATE_VALUE}
        aria-labelledby={createTitleId}
        aria-describedby={createDetailId}
        aria-disabled={busy || undefined}
        data-create-name={typedName}
        data-create-state={
          busy ? 'busy' : refusal === undefined ? 'offered' : 'refused'
        }
        className={ITEM_CLASSES}
      >
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
          {busy ? (
            <Spinner size="xs" className="m-0" />
          ) : (
            <Plus aria-hidden className="size-5" />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span id={createTitleId} className="font-semibold break-words">
            {intl.formatMessage(busy ? words.createRowBusy : words.createRow, {
              attributeName: typedName,
            })}
          </span>
          {refusal === undefined ? (
            <span
              id={createDetailId}
              className="flex items-center gap-2 text-sm text-current/70"
            >
              {newVariableType !== undefined &&
                isVariableType(newVariableType) && (
                  <AttributeTypeMark type={newVariableType} />
                )}
              {typeName === undefined
                ? intl.formatMessage(words.createRowUntyped)
                : intl.formatMessage(words.createRowType, {
                    typeName: intl.formatMessage(typeName),
                  })}
            </span>
          ) : (
            <span
              id={createDetailId}
              className="text-destructive-ink flex items-start gap-2 text-sm"
            >
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">{refusal}</span>
            </span>
          )}
        </span>
      </Combobox.Item>
    );
  };

  /**
   * What the list says above its rows, when it has something to say: an
   * invitation to create the first attribute, the caller's sentence when none
   * of the attributes can be chosen, or that nothing matches the search.
   */
  const listNote = (() => {
    if (query.trim() === '') {
      if (anyAvailable) return undefined;
      if (options.length > 0) {
        return intl.formatMessage(
          onCreateOption === undefined
            ? words.noneAvailable
            : words.noneAvailableCreate,
        );
      }
      if (onCreateOption !== undefined) {
        return intl.formatMessage(words.firstAttribute, firstAttributeTags);
      }
      return emptyMessage ?? intl.formatMessage(words.emptyState);
    }
    if (available.length === 0 && unavailable.length === 0 && !offersCreate) {
      return intl.formatMessage(words.noMatches, { query: query.trim() });
    }
    return undefined;
  })();

  const hasRows =
    offersCreate || available.length > 0 || unavailable.length > 0;

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
          {emptyMessage ?? intl.formatMessage(words.emptyState)}
        </p>
      ) : (
        <>
          <Combobox.Root<string>
            value={value === undefined || value === '' ? null : value}
            onValueChange={handleValueChange}
            inputValue={query}
            onInputValueChange={(next, details) => {
              // Only typing changes the search. Base UI also writes the chosen
              // item's text into the box when an item is pressed.
              if (details.reason !== 'input-change') return;
              setQuery(next);
              setRevealed(undefined);
              if (create?.kind === 'refused') setCreate(undefined);
            }}
            open={open}
            onOpenChange={handleOpenChange}
            onItemHighlighted={(highlighted) => {
              // A reason is shown only for the row that was chosen, and goes
              // when the highlight moves to another row.
              if (highlighted !== revealed) setRevealed(undefined);
            }}
            autoHighlight
            filter={null}
          >
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
              // Not `disabled`: a disabled button cannot take focus, and a save
              // that is refused while the form is busy sends focus here (every
              // field is disabled for as long as a save is in flight). The list
              // refuses to open while the field takes no answers.
              aria-disabled={disabled || undefined}
              aria-readonly={readOnly || undefined}
              // Names this control as where a refused save sends focus for
              // this field: it resolves a "choose an attribute" error.
              data-field-focus-target=""
              className={comboboxTriggerVariants({
                state: getInputState({
                  disabled,
                  readOnly,
                  'aria-invalid': ariaInvalid === true,
                }),
                className: cx(
                  'relative w-full',
                  heldPill !== undefined && 'ps-1.5',
                ),
              })}
            >
              {/* One grid cell, so that a value leaving and the value
                  arriving share it while they cross. */}
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
                        {intl.formatMessage(words.placeholder)}
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
              {/* The trigger's border confirms a choice made here: it flashes
                  in the colour a chosen row's check mark takes. Keyed by the
                  choice, so each one plays it once and nothing else does. */}
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
            <Combobox.Portal container={portalContainer ?? undefined}>
              {/* The popup layer, as `Popover`'s: this opens inside dialogs. */}
              <Combobox.Positioner
                align="start"
                sideOffset={8}
                // The popup layer, except while a create is with the codebook:
                // a create can open the codebook's own editor, which has to
                // paint over this list rather than under it.
                className={busy ? undefined : 'z-3000'}
              >
                <Combobox.Popup
                  {...{ [POPUP_MARKER]: '' }}
                  aria-labelledby={ariaLabelledBy}
                  aria-label={
                    ariaLabelledBy === undefined
                      ? accessibleNames.list
                      : undefined
                  }
                  render={
                    <Surface
                      floating
                      spacing="none"
                      shadow="lg"
                      noContainer
                      className="flex max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-80 flex-col"
                    />
                  }
                >
                  <div className="shrink-0 p-3">
                    <Combobox.Input
                      // Base UI points the box at the list only while the list
                      // has rows; a combobox must always name what it controls,
                      // and the list is there, empty, under a sentence that
                      // says why.
                      aria-controls={listId}
                      // Both the name and the placeholder say whether this
                      // list can create an attribute.
                      aria-label={
                        onCreateOption === undefined
                          ? accessibleNames.only
                          : accessibleNames.create
                      }
                      placeholder={intl.formatMessage(
                        onCreateOption === undefined
                          ? words.searchOnlyPlaceholder
                          : words.searchPlaceholder,
                      )}
                      readOnly={busy}
                      render={({
                        onChange: nativeOnChange,
                        ...renderProps
                      }) => (
                        <InputField
                          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the same bridge fresco-ui's Combobox uses: Base UI types its input props as generic HTML attributes
                          {...(renderProps as unknown as ComponentPropsWithRef<
                            typeof InputField
                          >)}
                          size="sm"
                          prefixComponent={<SearchIcon aria-hidden />}
                          className="w-full"
                          nativeOnChange={nativeOnChange}
                        />
                      )}
                    />
                  </div>
                  {listNote !== undefined && (
                    <p className="flex items-start gap-2 px-4 pb-3 text-sm text-current/70">
                      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0">{listNote}</span>
                    </p>
                  )}
                  {hasRows && (
                    <Combobox.List
                      id={listId}
                      className="flex min-h-0 flex-col outline-none"
                    >
                      {/*
                        `role="group"`: ScrollArea's viewport is focusable,
                        and a listbox may only contain options and groups.
                      */}
                      <ScrollArea
                        role="group"
                        aria-label={accessibleNames.list}
                        className="max-h-80 min-h-0"
                        viewportClassName="flex flex-col px-2 pt-0 pb-2"
                      >
                        {createRow()}
                        {available.map(attributeRow)}
                        {unavailable.length > 0 && (
                          <Combobox.Group
                            className={cx(
                              'flex flex-col',
                              (available.length > 0 || offersCreate) &&
                                'border-outline mt-2 border-t pt-2',
                            )}
                          >
                            <Combobox.GroupLabel className="px-4 py-1.5 text-sm font-semibold text-current/70">
                              {intl.formatMessage(words.unavailableHeading)}
                            </Combobox.GroupLabel>
                            {unavailable.map(attributeRow)}
                          </Combobox.Group>
                        )}
                      </ScrollArea>
                    </Combobox.List>
                  )}
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </Combobox.Root>
          {/* Said where it is seen without opening the list, while nothing
              is chosen and nothing in the list can be: the caller's sentence
              when there are no attributes at all, and otherwise that the ones
              there are cannot be used here. */}
          {heldPill === undefined &&
            !anyAvailable &&
            (options.length > 0 || emptyMessage !== undefined) && (
              <p className="text-sm text-current/70">
                {options.length > 0
                  ? intl.formatMessage(words.noneAvailableField)
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
              {intl.formatMessage(words.missingAttribute)}
            </p>
          )}
          {heldReason !== undefined && (
            <p id={reasonId} className="text-destructive-ink text-sm">
              {heldReason}
            </p>
          )}
          {/* Says what the list shows as it changes: the reason for an
              attribute that cannot be chosen, and a create on its way or
              refused. Always mounted, so a screen reader is watching it
              before there is anything to say. */}
          <span className="sr-only" aria-live="polite">
            {announcement}
          </span>
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
                  {intl.formatMessage(words.createdUnassigned, {
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
