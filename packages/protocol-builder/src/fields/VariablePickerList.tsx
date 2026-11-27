import { Combobox } from '@base-ui/react/combobox';
import { Check, Info, Plus, SearchIcon, TriangleAlert } from 'lucide-react';
import {
  type ComponentPropsWithRef,
  Fragment,
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
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

import { variableTypeLabel } from '../codebook/variableTypeLabels.ts';
import { protocolAuthoringLinks } from '../interfaces/documentation.ts';
import { isVariableType } from '../rules/operators.ts';
import {
  variableNameRefusal,
  type VariableNameScope,
} from './variableNameRules.ts';
import type {
  CreateOptionOutcome,
  VariablePickerOption,
} from './VariablePickerField.tsx';
import {
  VariableKindMark,
  variableKindEnglishName,
  VariablePill,
  type VariablePillProps,
} from './VariablePill.tsx';

/**
 * A row of the list that does something other than choose an attribute, such
 * as "Create dynamic attribute". Listed after the attributes of its group, or
 * at the end of the list.
 */
type VariablePickerAction = Readonly<{
  id: string;
  label: string;
  /** Decorative; a plus sign when absent. */
  icon?: ReactNode;
  onSelect: () => void;
}>;

/**
 * A titled group of attributes ("Node attributes", "Ego attributes"…). The
 * headings come from `attributeGroups.ts`, so every list names its groups in
 * the same words.
 */
export type VariablePickerGroup = Readonly<{
  id: string;
  label: string;
  options: readonly VariablePickerOption[];
  actions?: readonly VariablePickerAction[];
}>;

export type VariablePickerListProps = Readonly<{
  /** Attributes listed without a heading, before any group. */
  'options'?: readonly VariablePickerOption[];
  /** Attributes listed under headings, in this order, after `options`. */
  'groups'?: readonly VariablePickerGroup[];
  /**
   * Where an attribute that cannot be chosen is listed.
   *
   * `grouped` gathers them after the ones that can be chosen, under "Not
   * available here", and shows the reason when one is chosen. `inPlace` keeps
   * each in its own place, dimmed, with its reason always shown beneath it.
   * Defaults to `inPlace` when there are `groups`, and to `grouped` otherwise.
   */
  'unavailableDisplay'?: 'grouped' | 'inPlace';
  /** Rows listed after every attribute. */
  'actions'?: readonly VariablePickerAction[];
  /**
   * How a row draws its attribute, where the name and the type are not enough:
   * a dynamic attribute's row shows its values.
   */
  'optionPill'?: (option: VariablePickerOption) => VariablePillProps;
  /** The attribute held now, which the list marks with a check. */
  'value'?: string;
  /** An attribute that can be chosen has been chosen. */
  'onSelect': (value: string) => void;
  /** See `VariablePickerField`'s prop of the same name. */
  'onCreateOption'?: (variableName: string) => Promise<CreateOptionOutcome>;
  'nameScope'?: VariableNameScope;
  'newVariableType'?: string;
  /** Said when there are no attributes at all and none may be created. */
  'emptyMessage'?: string;
  /**
   * The trigger that opens the list in its own popup, as a `Combobox.Trigger`.
   * Absent: the list is drawn in place, open, for a caller that puts it inside
   * its own popover (the Attribute menu, the field picker).
   */
  'trigger'?: ReactNode;
  /** Whether the popup is open. Ignored when the list is drawn in place. */
  'open'?: boolean;
  /**
   * The list asks to open or close: after a choice, a create or an action,
   * and on Escape. A list drawn in place asks to close in the same moments.
   */
  'onOpenChange'?: (open: boolean) => void;
  /** Names the list; `aria-label` "Attributes" when neither is given. */
  'aria-labelledby'?: string;
  'aria-label'?: string;
}>;

const messages = defineMessages({
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
  createHint: {
    id: 'protocolBuilder.variablePicker.createHint',
    defaultMessage: 'Type a name in the search box to create a new attribute.',
    description:
      'Shown at the bottom of the attribute list while the search box is empty, where this control allows a new attribute to be created. Typing a name adds a row that creates an attribute with that name.',
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
});

/**
 * Said when there is nothing to choose and nothing may be created: by the list
 * above its rows, and by the field in place of its control.
 */
export const emptyAttributeListMessage = messages.emptyState;

/**
 * The value of the create row. No attribute id can be it: a protocol mints ids
 * from printable characters, and this one starts with a NUL.
 */
const CREATE_VALUE = '\u0000create';

/** The value of an action row: NUL, then the action's id. */
const ACTION_PREFIX = '\u0000action:';

/**
 * Marks the popup, so that the field's blur handling and tests can tell the
 * picker's own popup from any dialog that it is opened inside.
 */
export const VARIABLE_PICKER_POPUP_MARKER = 'data-attribute-picker-popup';

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

/** What a screen reader is told about the kind of answer an attribute records. */
export const typeDescriptionFor = (type: VariableType | undefined) =>
  type === undefined
    ? undefined
    : `Attribute type: ${variableKindEnglishName(type)}`;

/** The pill of an option, wherever the picker draws one. */
export const optionPillProps = (
  option: VariablePickerOption,
  optionPill: VariablePickerListProps['optionPill'],
): VariablePillProps => ({
  name: option.label,
  ...(option.type === undefined ? {} : { kind: option.type }),
  ...optionPill?.(option),
  size: 'md',
});

/** Every option of the list, grouped or not. */
export const allPickerOptions = ({
  options = [],
  groups = [],
}: Pick<VariablePickerListProps, 'options' | 'groups'>) => [
  ...options,
  ...groups.flatMap((group) => group.options),
];

/** The create that is waiting for the codebook, or that it refused. */
type CreateState =
  | Readonly<{ kind: 'busy'; name: string }>
  | Readonly<{ kind: 'refused'; name: string; message: string }>
  | undefined;

/** One part of the list as drawn: the ungrouped rows, or a group. */
type Section = Readonly<{
  id: string;
  label?: string;
  rows: readonly VariablePickerOption[];
  actions: readonly VariablePickerAction[];
}>;

/**
 * The searchable list of attributes that every attribute picker shows.
 *
 * Inside `VariablePickerField`'s own popup, and drawn in place inside the
 * popovers of the rich text editor (the Attribute menu and the field picker
 * of a form). The codebooks it searches are long, so the search box narrows
 * the list by a fuzzy match ("mrd" finds "married"), and each row shows what
 * kind of answer its attribute records.
 *
 * Attributes that cannot be chosen are still listed with the reason, so a
 * researcher looking for one finds it and learns why instead of wondering
 * where it went. A caller that knows what a new attribute would be for passes
 * `onCreateOption`, and the list's first row then offers to create the name
 * typed into the search box.
 */
export default function VariablePickerList(props: VariablePickerListProps) {
  const {
    options = [],
    groups = [],
    actions = [],
    optionPill,
    value,
    onSelect,
    onCreateOption,
    nameScope,
    newVariableType,
    emptyMessage,
    trigger,
    onOpenChange,
    'aria-labelledby': ariaLabelledBy,
    'aria-label': ariaLabel,
  } = props;
  const inline = trigger === undefined;
  const open = inline || props.open === true;
  const unavailableDisplay =
    props.unavailableDisplay ?? (groups.length > 0 ? 'inPlace' : 'grouped');
  const inPlace = unavailableDisplay === 'inPlace';

  const intl = useAppIntl();
  const portalContainer = usePortalContainer();
  const scopeId = useId();
  const listId = `${scopeId}-list`;
  const createTitleId = `${scopeId}-create-title`;
  const createDetailId = `${scopeId}-create-detail`;

  const [query, setQuery] = useState('');
  /** The unavailable attribute whose reason is shown, if any. */
  const [revealed, setRevealed] = useState<string | undefined>(undefined);
  const [create, setCreate] = useState<CreateState>(undefined);
  const busy = create?.kind === 'busy';
  /** What the polite region says: a reason, or the state of a create. */
  const [announcement, setAnnouncement] = useState('');

  // A popup that closes forgets its search, its revealed reason and any
  // refusal: the next opening starts afresh. Adjusted while rendering, as
  // React documents for state that follows a changed prop.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setQuery('');
      setRevealed(undefined);
      setCreate(undefined);
    }
  }

  const everyOption = useMemo(
    () => allPickerOptions({ options, groups }),
    [groups, options],
  );

  const sections = useMemo<readonly Section[]>(() => {
    const filtered = (list: readonly VariablePickerOption[]) =>
      fuzzyFilter(
        list.toSorted((first, second) =>
          first.label.localeCompare(second.label, intl.locale),
        ),
        query,
        (option) => option.label,
        intl.locale,
      );
    const searching = query.trim() !== '';
    return [
      { id: '', rows: filtered(options), actions: [] },
      ...groups.map((group) => ({
        id: group.id,
        label: group.label,
        rows: filtered(group.options),
        actions: group.actions ?? [],
      })),
    ].filter(
      (section) =>
        section.rows.length > 0 ||
        // A group with nothing that matches the search is left out; one with
        // nothing at all still offers its actions.
        (!searching && section.actions.length > 0),
    );
  }, [groups, intl.locale, options, query]);

  const matching = sections.flatMap((section) => section.rows);
  // In `grouped` display, the attributes that cannot be chosen are gathered
  // at the end: those ruled out for a reason about this setting first, then
  // those ruled out only for their type, each group in name order.
  const gathered = inPlace
    ? []
    : matching
        .filter((option) => option.unavailableReason !== undefined)
        .toSorted(
          (first, second) =>
            Number(first.unavailableForType === true) -
            Number(second.unavailableForType === true),
        );
  const anyAvailable = everyOption.some(
    (option) => option.unavailableReason === undefined,
  );

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
    return everyOption.some(
      (option) => normalizeForComparison(option.label) === typed,
    );
  }, [everyOption, typedName]);
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
        ? variableNameRefusal(typedName, {
            intl,
            ...(nameScope === undefined ? {} : { scope: nameScope }),
            ...(newVariableType === undefined ? {} : { type: newVariableType }),
          })
        : undefined,
    [intl, nameScope, newVariableType, offersCreate, typedName],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      // The answer decides what this list does next, so it is not dismissed
      // while a create is with the codebook. The write completes regardless,
      // and leaving would look like calling it off.
      if (!nextOpen && busy) return;
      onOpenChange?.(nextOpen);
    },
    [busy, onOpenChange],
  );

  const requestCreate = useCallback(async () => {
    if (onCreateOption === undefined || invalidName !== undefined || busy) {
      return;
    }
    const variableName = typedName;
    setCreate({ kind: 'busy', name: variableName });
    setAnnouncement(
      intl.formatMessage(messages.createRowBusy, {
        attributeName: variableName,
      }),
    );
    let outcome: CreateOptionOutcome | undefined;
    try {
      outcome = await onCreateOption(variableName);
    } catch {
      // The caller broke the promise `onCreateOption` makes; what it means
      // for the researcher is the caller's to say, on its own surface.
      outcome = undefined;
    }
    // A refusal is ABOUT this name, so the list stays open with it still in
    // the search box, and the reason is shown on the row it was asked from.
    if (outcome?.status === 'refused') {
      setAnnouncement(outcome.message ?? '');
      setCreate(
        outcome.message === undefined
          ? undefined
          : { kind: 'refused', name: variableName, message: outcome.message },
      );
      return;
    }
    // Every other answer means the codebook now has it (or nothing is known
    // at all), and asking for it a second time would be refused for a
    // duplicate name the researcher never chose to ask for.
    setAnnouncement('');
    setCreate(undefined);
    onOpenChange?.(false);
  }, [busy, intl, invalidName, onCreateOption, onOpenChange, typedName]);

  const handleValueChange = (
    next: string | null,
    details: Combobox.Root.ChangeEventDetails,
  ) => {
    // The list keeps its own choice out of the field: every outcome below is
    // decided here, and Base UI is told what happened only by the value.
    details.cancel();
    if (busy || next === null) return;
    if (next === CREATE_VALUE) {
      void requestCreate();
      return;
    }
    if (next.startsWith(ACTION_PREFIX)) {
      const id = next.slice(ACTION_PREFIX.length);
      const action = [
        ...actions,
        ...groups.flatMap((group) => group.actions ?? []),
      ].find((candidate) => candidate.id === id);
      onOpenChange?.(false);
      action?.onSelect();
      return;
    }
    const option = everyOption.find((candidate) => candidate.value === next);
    if (option?.unavailableReason !== undefined) {
      // Base UI does nothing at all for a `disabled` item, so an unavailable
      // row is only `aria-disabled`, and choosing it is answered here: nothing
      // is selected, and the reason is shown under its pill.
      setRevealed(option.value);
      setAnnouncement(option.unavailableReason);
      return;
    }
    onSelect(next);
    onOpenChange?.(false);
  };

  const attributeRow = (option: VariablePickerOption) => {
    const isUnavailable = option.unavailableReason !== undefined;
    const showsReason = isUnavailable && (inPlace || revealed === option.value);
    const rowTypeId = `${scopeId}-${option.value}-type`;
    const rowReasonId = `${scopeId}-${option.value}-reason`;
    const typeDescription = typeDescriptionFor(option.type);
    const describedBy =
      [
        typeDescription === undefined ? undefined : rowTypeId,
        showsReason ? rowReasonId : undefined,
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
        data-revealed={showsReason || undefined}
        data-marked={option.marker === undefined ? undefined : ''}
        className={cx(ITEM_CLASSES, 'flex-col items-stretch')}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cx('min-w-0 flex-1', isUnavailable && 'opacity-50')}>
            <VariablePill {...optionPillProps(option, optionPill)} />
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
        {option.marker !== undefined && (
          // Part of the row's name, after the attribute's own, so that a
          // screen reader says it too.
          <span
            data-marker=""
            className="flex items-center gap-1.5 ps-1 pb-1 text-xs font-semibold"
          >
            <span
              aria-hidden
              className="bg-warning size-2 shrink-0 rounded-full"
            />
            {/* A pause between the name and the note. Screen-reader text,
                which stays English. */}
            <span className="sr-only">, </span>
            {option.marker}
          </span>
        )}
        {showsReason &&
          (inPlace ? (
            // Always beside its attribute: read as the row's description,
            // and hidden from its name, which is the attribute's own name.
            <span
              id={rowReasonId}
              aria-hidden
              className="ps-1 pb-1 text-xs text-current/70"
            >
              {option.unavailableReason}
            </span>
          ) : (
            <span
              id={rowReasonId}
              aria-hidden
              className="flex items-start gap-2 ps-1 pb-1 text-sm text-current/80"
            >
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">{option.unavailableReason}</span>
            </span>
          ))}
      </Combobox.Item>
    );
  };

  const actionRow = (action: VariablePickerAction) => (
    <Combobox.Item
      key={`action:${action.id}`}
      value={`${ACTION_PREFIX}${action.id}`}
      aria-disabled={busy || undefined}
      data-picker-action={action.id}
      className={cx(ITEM_CLASSES, 'items-center font-semibold')}
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center"
      >
        {action.icon ?? <Plus className="size-5" />}
      </span>
      <span className="min-w-0 break-words">{action.label}</span>
    </Combobox.Item>
  );

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
              {intl.formatMessage(messages.createRowInvalidName, {
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
            {intl.formatMessage(
              busy ? messages.createRowBusy : messages.createRow,
              { attributeName: typedName },
            )}
          </span>
          {refusal === undefined ? (
            <span
              id={createDetailId}
              className="flex items-center gap-2 text-sm text-current/70"
            >
              {newVariableType !== undefined &&
                isVariableType(newVariableType) && (
                  <VariableKindMark kind={newVariableType} />
                )}
              {typeName === undefined
                ? intl.formatMessage(messages.createRowUntyped)
                : intl.formatMessage(messages.createRowType, {
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
      if (everyOption.length > 0) {
        return intl.formatMessage(
          onCreateOption === undefined
            ? messages.noneAvailable
            : messages.noneAvailableCreate,
        );
      }
      if (onCreateOption !== undefined) {
        return intl.formatMessage(messages.firstAttribute, firstAttributeTags);
      }
      // A list with nothing but actions has nothing to apologise for.
      if (sections.length > 0 || actions.length > 0) return undefined;
      return emptyMessage ?? intl.formatMessage(messages.emptyState);
    }
    if (matching.length === 0 && !offersCreate) {
      return intl.formatMessage(messages.noMatches, { query: query.trim() });
    }
    return undefined;
  })();

  /** Rows shown in a section: all of them in place, or only the choosable. */
  const shownRows = (section: Section) =>
    inPlace
      ? section.rows
      : section.rows.filter((option) => option.unavailableReason === undefined);

  const hasRows = offersCreate || sections.length > 0 || actions.length > 0;
  // The create hint stands for the create row while there is no name to
  // create: shown once there are attributes to search, which the invitation to
  // create the first one does for an empty list.
  const showsCreateHint =
    onCreateOption !== undefined &&
    query.trim() === '' &&
    everyOption.length > 0;

  let drawnBefore = offersCreate;
  const sectionElements = sections.map((section) => {
    const rows = shownRows(section);
    if (rows.length === 0 && section.actions.length === 0) return null;
    const separated = drawnBefore;
    drawnBefore = true;
    if (section.label === undefined) {
      return <Fragment key="ungrouped">{rows.map(attributeRow)}</Fragment>;
    }
    return (
      <Combobox.Group
        key={section.id}
        data-attribute-group={section.id}
        className={cx(
          'flex flex-col',
          separated && 'border-outline mt-2 border-t pt-2',
        )}
      >
        <Combobox.GroupLabel className="px-4 py-1.5 text-sm font-semibold text-current/70">
          {section.label}
        </Combobox.GroupLabel>
        {rows.map(attributeRow)}
        {section.actions.map(actionRow)}
      </Combobox.Group>
    );
  });

  const content = (
    <>
      <div className="shrink-0 p-3">
        <Combobox.Input
          // Base UI points the box at the list only while the list has rows;
          // a combobox must always name what it controls, and the list is
          // there, empty, under a sentence that says why.
          aria-controls={listId}
          // Both the name and the placeholder say whether this list can
          // create an attribute.
          aria-label={
            onCreateOption === undefined
              ? 'Find an attribute'
              : 'Find or create an attribute'
          }
          placeholder={intl.formatMessage(
            onCreateOption === undefined
              ? messages.searchOnlyPlaceholder
              : messages.searchPlaceholder,
          )}
          readOnly={busy}
          render={({ onChange: nativeOnChange, ...renderProps }) => (
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
            `role="group"`: ScrollArea's viewport is focusable, and a listbox
            may only contain options and groups.
          */}
          <ScrollArea
            role="group"
            aria-label="Attributes"
            className="max-h-80 min-h-0"
            viewportClassName="flex flex-col px-2 pt-0 pb-2"
          >
            {createRow()}
            {sectionElements}
            {gathered.length > 0 && (
              <Combobox.Group
                className={cx(
                  'flex flex-col',
                  drawnBefore && 'border-outline mt-2 border-t pt-2',
                )}
              >
                <Combobox.GroupLabel className="px-4 py-1.5 text-sm font-semibold text-current/70">
                  {intl.formatMessage(messages.unavailableHeading)}
                </Combobox.GroupLabel>
                {gathered.map(attributeRow)}
              </Combobox.Group>
            )}
            {actions.length > 0 && (
              <Combobox.Group
                className={cx(
                  'flex flex-col',
                  (drawnBefore || gathered.length > 0) &&
                    'border-outline mt-2 border-t pt-2',
                )}
              >
                {actions.map(actionRow)}
              </Combobox.Group>
            )}
          </ScrollArea>
        </Combobox.List>
      )}
      {showsCreateHint && (
        <p className="border-outline flex items-center gap-2 border-t px-4 py-2.5 text-sm text-current/70">
          <Plus aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0">
            {intl.formatMessage(messages.createHint)}
          </span>
        </p>
      )}
    </>
  );

  return (
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
          // A chosen row's reason goes when the highlight moves to another row.
          if (highlighted !== revealed) setRevealed(undefined);
        }}
        inline={inline}
        autoHighlight
        filter={null}
      >
        {inline ? (
          <div
            {...{ [VARIABLE_PICKER_POPUP_MARKER]: '' }}
            role="group"
            aria-labelledby={ariaLabelledBy}
            aria-label={
              ariaLabelledBy === undefined
                ? (ariaLabel ?? 'Attributes')
                : undefined
            }
            className="flex min-h-0 w-full min-w-80 flex-col"
          >
            {content}
          </div>
        ) : (
          <>
            {trigger}
            <Combobox.Portal container={portalContainer ?? undefined}>
              {/*
                The popup layer, as `Popover`'s: this opens inside dialogs. The
                codebook's own editor, which a create can open, opens after
                this list and so is drawn over it (see
                `PortalContainerProvider`).
              */}
              <Combobox.Positioner
                align="start"
                sideOffset={8}
                className="z-3000"
              >
                <Combobox.Popup
                  {...{ [VARIABLE_PICKER_POPUP_MARKER]: '' }}
                  aria-labelledby={ariaLabelledBy}
                  aria-label={
                    ariaLabelledBy === undefined
                      ? (ariaLabel ?? 'Attributes')
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
                  {content}
                </Combobox.Popup>
              </Combobox.Positioner>
            </Combobox.Portal>
          </>
        )}
      </Combobox.Root>
      {/* Says what the list shows as it changes: the reason for an attribute
          that cannot be chosen, and a create on its way or refused. Always
          mounted, so a screen reader is watching it before there is anything
          to say. */}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
