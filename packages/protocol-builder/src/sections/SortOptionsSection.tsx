import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import { getSortOrderOptionGetter } from '../fields/sortOrderOptions.ts';
import {
  makeMultiSelectValidation,
  type PropertyField,
} from '../form/arrayFields/MultiSelect.tsx';
import OptionalList from '../form/arrayFields/OptionalList.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import { sectionMessages } from './sectionMessages.ts';
import {
  DATA_SOURCE,
  useColumnOptionGetter,
  useOrphanedColumns,
  useRosterColumns,
} from './useRosterColumns.ts';

/** Where a roster stage records how its people are ordered. */
const SORT_ORDER = 'sortOptions.sortOrder';
const SORTABLE_PROPERTIES = 'sortOptions.sortableProperties';

const SORT_ORDER_COLUMNS: PropertyField[] = [
  { fieldName: 'property', label: 'Attribute' },
  { fieldName: 'direction', label: 'Direction' },
];

const SORTABLE_COLUMNS: PropertyField[] = [
  { fieldName: 'variable', label: 'Attribute' },
  {
    fieldName: 'label',
    control: 'input',
    label: 'Label',
    placeholder: 'Age',
  },
];

const SORT_CAPABILITY: SectionCapability = {
  fields: [SORT_ORDER, SORTABLE_PROPERTIES],
  confirmClear: {
    title: sectionMessages.sortOptionsClearTitle,
    description: sectionMessages.sortOptionsClearDescription,
    confirmLabel: sectionMessages.sortOptionsClearConfirm,
  },
};

/**
 * The words this section says, in English until it is localised — at which
 * point each comment below becomes the `description` a translator reads.
 *
 * Nothing overrides them: a `copy` prop is a string a host hands in, which
 * extraction never sees and a translator therefore never gets
 * (`__tests__/hostCopyOverrides.test.ts`).
 */
const words = {
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: 'Roster order',
  description:
    'Decide the order people appear in, and which attributes the participant may reorder them by.',
  /** Said instead of `description` while the section is waiting on a roster. */
  waitingDescription:
    'Choose a roster data file before deciding how its people are ordered.',
  orderLabel: 'Starting order',
  orderHint:
    'How the roster is sorted before the participant changes anything. Without a rule, people keep the order the data file lists them in.',
  orderAddButtonLabel: 'Add new sort rule',
  sortableLabel: 'Attributes the participant may sort by',
  sortableHint:
    'Each becomes a control above the roster, under the label you give it here.',
  sortableAddButtonLabel: 'Add new sortable attribute',
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

  const orderValidation = useMemo(
    () => makeMultiSelectValidation(SORT_ORDER_COLUMNS, orderOrphans.dangling),
    [orderOrphans.dangling],
  );
  const sortableValidation = useMemo(
    () => makeMultiSelectValidation(SORTABLE_COLUMNS, sortableOrphans.dangling),
    [sortableOrphans.dangling],
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={
        columns.waiting ? words.waitingDescription : words.description
      }
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
        label={words.orderLabel}
        hint={words.orderHint}
        component={OptionalList}
        addButtonLabel={words.orderAddButtonLabel}
        properties={SORT_ORDER_COLUMNS}
        options={orderOptions}
        maxItems={1}
        emptyStateMessage="People appear in the order the data file lists them."
        {...orderValidation}
      />
      <ProtocolArrayField<typeof OptionalList>
        name={SORTABLE_PROPERTIES}
        label={words.sortableLabel}
        hint={words.sortableHint}
        component={OptionalList}
        addButtonLabel={words.sortableAddButtonLabel}
        properties={SORTABLE_COLUMNS}
        options={sortableOptions}
        // An orphan counts: the row holding it is one of the rows this limit
        // is counting, and it has to stay removable.
        maxItems={(columns.names?.length ?? 0) + sortableOrphans.options.length}
        emptyStateMessage="The participant cannot reorder the roster."
        {...sortableValidation}
      />
    </BuilderSection>
  );
}
