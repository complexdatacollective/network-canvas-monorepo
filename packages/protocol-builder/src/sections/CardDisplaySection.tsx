import { useMemo } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

import MultiSelect, {
  makeMultiSelectValidation,
  type PropertyField,
} from '../form/arrayFields/MultiSelect.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';
import {
  DATA_SOURCE,
  useColumnOptionGetter,
  useOrphanedColumns,
  useRosterColumns,
} from './useRosterColumns.ts';

/** Where a roster stage records the extra facts its cards show. */
const CARD_PROPERTIES = 'cardOptions.additionalProperties';

const CARD_PROPERTY_COLUMNS: PropertyField[] = [
  { fieldName: 'variable', label: 'Attribute' },
  {
    fieldName: 'label',
    control: 'input',
    label: 'Label',
    placeholder: 'Age',
  },
];

const CARD_CAPABILITY: SectionCapability = {
  fields: [CARD_PROPERTIES],
  confirmClear: {
    title: 'This will clear the card details',
    description:
      'This will remove every extra attribute your roster cards show, along with the labels you gave them. Do you want to continue?',
    confirmLabel: 'Clear card details',
  },
};

export type CardDisplayCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /** Said instead of `description` while the section is waiting on a roster. */
  waitingDescription: string;
  fieldLabel: string;
  fieldHint: string;
  addButtonLabel: string;
}>;

const DEFAULT_COPY: CardDisplayCopy = {
  sectionTitle: 'Card details',
  description:
    'Show extra attributes on each roster card, so the participant can tell two similar people apart.',
  waitingDescription:
    'Choose a roster data file before deciding what its cards show.',
  fieldLabel: 'Attributes shown on a card',
  fieldHint:
    'Each attribute appears beneath the name, under the label you give it here.',
  addButtonLabel: 'Add new card detail',
};

export type CardDisplaySectionProps = Readonly<{
  copy?: Partial<CardDisplayCopy>;
}>;

/**
 * What a roster card shows besides a name.
 *
 * The name is always the card's title, so this is genuinely optional: a roster
 * of people with distinct names needs nothing more. It becomes essential the
 * moment two of them are called the same thing, which is what the extra
 * attributes are for.
 *
 * The attributes come from the data file rather than from the codebook — a
 * roster is external data, and a column in it need not be a codebook attribute
 * at all.
 */
export default function CardDisplaySection({
  copy,
}: CardDisplaySectionProps = {}) {
  const words = { ...DEFAULT_COPY, ...copy };
  const columns = useRosterColumns();
  const orphans = useOrphanedColumns(
    'variable',
    CARD_PROPERTIES,
    columns.names,
  );
  const options = useColumnOptionGetter(columns.names, orphans.options);
  const validation = useMemo(
    () => makeMultiSelectValidation(CARD_PROPERTY_COLUMNS, orphans.dangling),
    [orphans.dangling],
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
      capability={CARD_CAPABILITY}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          Every card is titled with the person&apos;s <strong>name</strong> from
          the data file. These attributes appear beneath it.
        </AlertDescription>
      </Alert>
      {/*
        Mounted whatever the data file turned out to hold, including while it
        is still being read. The stage saves its REGISTERED fields, so a list
        that stopped mounting for an already-configured value would delete it
        silently; `maxItems` of 0 hides the add control, which is all the empty
        case needs.
      */}
      <ProtocolArrayField<typeof MultiSelect>
        name={CARD_PROPERTIES}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={MultiSelect}
        addButtonLabel={words.addButtonLabel}
        properties={CARD_PROPERTY_COLUMNS}
        options={options}
        // An orphan counts: the row holding it is one of the rows this limit
        // is counting, and it has to stay removable.
        maxItems={(columns.names?.length ?? 0) + orphans.options.length}
        emptyStateMessage="No extra attributes are shown on a card."
        {...validation}
      />
    </BuilderSection>
  );
}
