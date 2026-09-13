import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { getSortOrderOptionGetter } from '../../../fields/sortOrderOptions.ts';
import {
  makeMultiSelectValidation,
  type PropertyField,
} from '../../../form/arrayFields/MultiSelect.tsx';
import OptionalList from '../../../form/arrayFields/OptionalList.tsx';
import BuilderSection, {
  type SectionCapability,
} from '../../../sections/BuilderSection.tsx';
import {
  DATA_SOURCE,
  useColumnOptionGetter,
  useColumnSectionShell,
  useOrphanedColumns,
  useRosterColumns,
} from './rosterColumns.ts';

/** Where a roster stage records how its people are ordered. */
const SORT_ORDER = 'sortOptions.sortOrder';
const SORTABLE_PROPERTIES = 'sortOptions.sortableProperties';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.sortOptions.title',
    defaultMessage: 'Roster sorting',
    description:
      'Heading of the section deciding the order a roster’s people appear in and what a participant may reorder them by. A roster is a list of people imported from a data file.',
  },
  description: {
    id: 'protocolBuilder.sortOptions.description',
    defaultMessage:
      'Configure the initial card order and the attributes participants can sort by.',
    description:
      'Description of the roster-order section. An attribute is one field the data file records about a person.',
  },
  waitingDescription: {
    id: 'protocolBuilder.sortOptions.waitingDescription',
    defaultMessage: 'Select a roster data source before configuring sorting.',
    description:
      'Shown in place of the roster-order section’s description while no data file has been chosen, so there are no columns to order by.',
  },
  orderLabel: {
    id: 'protocolBuilder.sortOptions.orderLabel',
    defaultMessage: 'Sort rule',
    description:
      'Label of the rule deciding how the roster is sorted before the participant changes anything.',
  },
  orderHint: {
    id: 'protocolBuilder.sortOptions.orderHint',
    defaultMessage:
      "Set the roster's initial sort order. Without a rule, nodes keep their order from the data file.",
    description: 'Guidance under the roster’s starting-order rule.',
  },
  orderAddLabel: {
    id: 'protocolBuilder.sortOptions.orderAddLabel',
    defaultMessage: 'Add new sort rule',
    description:
      'Button that adds the roster’s starting-order rule. Whole rather than a generic "Add", because this section shows two lists and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  sortableLabel: {
    id: 'protocolBuilder.sortOptions.sortableLabel',
    defaultMessage: 'Sortable properties',
    description:
      'Label of the list of attributes offered to the participant as ways to reorder the roster.',
  },
  sortableHint: {
    id: 'protocolBuilder.sortOptions.sortableHint',
    defaultMessage:
      'Select attributes that help participants locate a specific roster member.',
    description:
      'Guidance under the list of attributes the participant may reorder the roster by.',
  },
  sortableAddLabel: {
    id: 'protocolBuilder.sortOptions.sortableAddLabel',
    defaultMessage: 'Add new sortable property',
    description:
      'Button that offers the participant one more attribute to reorder the roster by. Whole rather than a generic "Add", because this section shows two lists and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
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
    defaultMessage: 'Label',
    description:
      'Placeholder shown in an empty label cell of the sortable-attribute list, naming what the cell holds.',
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

  const shell = useColumnSectionShell(
    columns,
    messages.description,
    messages.waitingDescription,
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
      description={shell.description}
      disabled={shell.disabled}
      // Everything below names a column of the data file, so a different file
      // makes every one of these a reference to something that may not be
      // there. See `CardDisplaySection`, which resets on the same path for the
      // same reason.
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
      <Field<typeof OptionalList>
        name={SORT_ORDER}
        label={intl.formatMessage(messages.orderLabel)}
        hint={intl.formatMessage(messages.orderHint)}
        component={OptionalList}
        addButtonLabel={intl.formatMessage(messages.orderAddLabel)}
        properties={orderProperties}
        options={orderOptions}
        maxItems={1}
        {...orderValidation}
      />
      <Field<typeof OptionalList>
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
        {...sortableValidation}
      />
    </BuilderSection>
  );
}
