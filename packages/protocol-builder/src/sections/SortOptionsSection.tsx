import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { getSortOrderOptionGetter } from '../fields/sortOrderOptions.ts';
import {
  makeMultiSelectValidation,
  type PropertyField,
} from '../form/arrayFields/MultiSelect.tsx';
import OptionalList from '../form/arrayFields/OptionalList.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import {
  DATA_SOURCE,
  useColumnOptionGetter,
  useOrphanedColumns,
  useRosterColumns,
} from './useRosterColumns.ts';

/** Where a roster stage records how its people are ordered. */
const SORT_ORDER = 'sortOptions.sortOrder';
const SORTABLE_PROPERTIES = 'sortOptions.sortableProperties';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.sortOptions.title',
    defaultMessage: 'Roster order',
    description:
      'Heading of the section deciding the order a roster’s people appear in and what a participant may reorder them by. A roster is a list of people imported from a data file.',
  },
  description: {
    id: 'protocolBuilder.sortOptions.description',
    defaultMessage:
      'Decide the order people appear in, and which attributes the participant may reorder them by.',
    description:
      'Description of the roster-order section. An attribute is one field the data file records about a person.',
  },
  waitingDescription: {
    id: 'protocolBuilder.sortOptions.waitingDescription',
    defaultMessage:
      'Choose a roster data file before deciding how its people are ordered.',
    description:
      'Shown in place of the roster-order section’s description while no data file has been chosen, so there are no columns to order by.',
  },
  orderLabel: {
    id: 'protocolBuilder.sortOptions.orderLabel',
    defaultMessage: 'Starting order',
    description:
      'Label of the rule deciding how the roster is sorted before the participant changes anything.',
  },
  orderHint: {
    id: 'protocolBuilder.sortOptions.orderHint',
    defaultMessage:
      'How the roster is sorted before the participant changes anything. Without a rule, people keep the order the data file lists them in.',
    description: 'Guidance under the roster’s starting-order rule.',
  },
  orderAddLabel: {
    id: 'protocolBuilder.sortOptions.orderAddLabel',
    defaultMessage: 'Add new sort rule',
    description:
      'Button that adds the roster’s starting-order rule. Whole rather than a generic "Add", because this section shows two lists and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  orderEmptyState: {
    id: 'protocolBuilder.sortOptions.orderEmptyState',
    defaultMessage: 'People appear in the order the data file lists them.',
    description:
      'Shown in place of the starting-order rule while the roster has none, saying what that means rather than that nothing is there.',
  },
  sortableLabel: {
    id: 'protocolBuilder.sortOptions.sortableLabel',
    defaultMessage: 'Attributes the participant may sort by',
    description:
      'Label of the list of attributes offered to the participant as ways to reorder the roster.',
  },
  sortableHint: {
    id: 'protocolBuilder.sortOptions.sortableHint',
    defaultMessage:
      'Each becomes a control above the roster, under the label you give it here.',
    description:
      'Guidance under the list of attributes the participant may reorder the roster by.',
  },
  sortableAddLabel: {
    id: 'protocolBuilder.sortOptions.sortableAddLabel',
    defaultMessage: 'Add new sortable attribute',
    description:
      'Button that offers the participant one more attribute to reorder the roster by. Whole rather than a generic "Add", because this section shows two lists and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  sortableEmptyState: {
    id: 'protocolBuilder.sortOptions.sortableEmptyState',
    defaultMessage: 'The participant cannot reorder the roster.',
    description:
      'Shown in place of the sortable-attribute list while none is offered, saying what that means rather than that nothing is there.',
  },
  attributeColumn: {
    id: 'protocolBuilder.sortOptions.attributeColumn',
    defaultMessage: 'Attribute',
    description:
      'Heading of the column of either roster-order list holding which attribute of the data file a row is about.',
  },
  directionColumn: {
    id: 'protocolBuilder.sortOptions.directionColumn',
    defaultMessage: 'Direction',
    description:
      'Heading of the column of the starting-order rule holding whether the roster is sorted upwards or downwards by the chosen attribute.',
  },
  labelColumn: {
    id: 'protocolBuilder.sortOptions.labelColumn',
    defaultMessage: 'Label',
    description:
      'Heading of the column of the sortable-attribute list holding the words the participant reads on the control that reorders the roster.',
  },
  labelPlaceholder: {
    id: 'protocolBuilder.sortOptions.labelPlaceholder',
    defaultMessage: 'Age',
    description:
      'Example label shown in an empty label cell of the sortable-attribute list. An example rather than an instruction, so a translation should be an equally ordinary thing a study records about a person.',
  },
  clearTitle: {
    id: 'protocolBuilder.sortOptions.clearTitle',
    defaultMessage: 'This will clear your sorting',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that decides the order a roster is shown in and what a participant may reorder it by.',
  },
  clearDescription: {
    id: 'protocolBuilder.sortOptions.clearDescription',
    defaultMessage:
      'This will remove the roster’s starting order and every attribute the participant could sort by. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching roster sorting off discards both the starting order and the attributes offered to the participant. A roster is a list of people imported from a data file.',
  },
  clearConfirm: {
    id: 'protocolBuilder.sortOptions.clearConfirm',
    defaultMessage: 'Clear sorting',
    description:
      'Action that confirms switching roster sorting off and discarding it.',
  },
});

/**
 * The columns of the two lists, in the reader's own language.
 *
 * Built from a formatter rather than kept as module constants, because a
 * `PropertyField` carries the words the researcher reads on the column heading
 * and in the empty cell beneath it.
 */
const sortOrderColumns = (intl: IntlShape): PropertyField[] => [
  {
    fieldName: 'property',
    label: intl.formatMessage(messages.attributeColumn),
  },
  {
    fieldName: 'direction',
    label: intl.formatMessage(messages.directionColumn),
  },
];

const sortableColumns = (intl: IntlShape): PropertyField[] => [
  {
    fieldName: 'variable',
    label: intl.formatMessage(messages.attributeColumn),
  },
  {
    fieldName: 'label',
    control: 'input',
    label: intl.formatMessage(messages.labelColumn),
    placeholder: intl.formatMessage(messages.labelPlaceholder),
  },
];

const SORT_CAPABILITY: SectionCapability = {
  fields: [SORT_ORDER, SORTABLE_PROPERTIES],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

/**
 * How a roster's people are ordered.
 *
 * Two related choices, kept in one section because a researcher deciding one
 * is deciding the other: the order the participant is shown first, and the
 * orders they may switch to. Optional — a short roster in the file's own order
 * needs neither — and switching it off destroys both, which is why the switch
 * asks first.
 *
 * The starting order is ONE rule. A roster is a flat list of people, and a
 * second rule could only ever break ties inside the first, which is not a
 * thing a participant scanning a list can perceive.
 */
export default function SortOptionsSection() {
  const intl = useAppIntl();
  const columns = useRosterColumns();

  // Two lists, two columns holding column names, so the same lost column can
  // strand a row in either — each is asked about its own.
  const orderOrphans = useOrphanedColumns(
    'property',
    SORT_ORDER,
    columns.names,
  );
  const sortableOrphans = useOrphanedColumns(
    'variable',
    SORTABLE_PROPERTIES,
    columns.names,
  );

  const sortableOptions = useColumnOptionGetter(
    columns.names,
    sortableOrphans.options,
  );
  const orderOptions = useMemo(
    () =>
      getSortOrderOptionGetter(
        [
          ...(columns.names ?? []).map((name) => ({
            value: name,
            label: name,
          })),
          ...orderOrphans.options,
        ],
        intl,
      ),
    [columns.names, intl, orderOrphans.options],
  );

  const orderProperties = useMemo(() => sortOrderColumns(intl), [intl]);
  const sortableProperties = useMemo(() => sortableColumns(intl), [intl]);
  const orderValidation = useMemo(
    () => makeMultiSelectValidation(orderProperties, orderOrphans.dangling),
    [orderOrphans.dangling, orderProperties],
  );
  const sortableValidation = useMemo(
    () =>
      makeMultiSelectValidation(sortableProperties, sortableOrphans.dangling),
    [sortableOrphans.dangling, sortableProperties],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(
        columns.waiting ? messages.waitingDescription : messages.description,
      )}
      disabled={columns.waiting}
      // Everything below names a column of the data file, so a different file
      // makes every one of these a reference to something that may not be
      // there. The PATH of the file, so the choice that caused the clear
      // travels in the same batch as the clear itself — a file this session
      // staged is withheld from a live host, and its clears have to wait with
      // it or the host is left describing the old file with none of the
      // settings that described it.
      resetOn={DATA_SOURCE}
      capability={SORT_CAPABILITY}
    >
      {/*
        Both lists are `OptionalList`s, so deleting the last row of either
        writes what the empty state on screen already says: a roster in the data
        file's own order, and a participant who cannot reorder it. An emptied
        `sortOrder` beside sortable attributes still keeps `sortOptions` — the
        researcher chose what participants may sort by, and only the starting
        order went — while emptying both leaves the capability absent, which is
        what the switch then reads on reopening.
      */}
      <ProtocolArrayField<typeof OptionalList>
        name={SORT_ORDER}
        label={intl.formatMessage(messages.orderLabel)}
        hint={intl.formatMessage(messages.orderHint)}
        component={OptionalList}
        addButtonLabel={intl.formatMessage(messages.orderAddLabel)}
        properties={orderProperties}
        options={orderOptions}
        maxItems={1}
        emptyStateMessage={intl.formatMessage(messages.orderEmptyState)}
        {...orderValidation}
      />
      <ProtocolArrayField<typeof OptionalList>
        name={SORTABLE_PROPERTIES}
        label={intl.formatMessage(messages.sortableLabel)}
        hint={intl.formatMessage(messages.sortableHint)}
        component={OptionalList}
        addButtonLabel={intl.formatMessage(messages.sortableAddLabel)}
        properties={sortableProperties}
        options={sortableOptions}
        // An orphan counts: the row holding it is one of the rows this limit
        // is counting, and it has to stay removable.
        maxItems={(columns.names?.length ?? 0) + sortableOrphans.options.length}
        emptyStateMessage={intl.formatMessage(messages.sortableEmptyState)}
        {...sortableValidation}
      />
    </BuilderSection>
  );
}
