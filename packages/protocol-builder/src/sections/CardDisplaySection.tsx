import { type ReactNode, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';

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

/** Where a roster stage records the extra facts its cards show. */
const CARD_PROPERTIES = 'cardOptions.additionalProperties';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.cardDisplay.title',
    defaultMessage: 'Card details',
    description:
      'Heading of the section choosing what each card in a roster shows about a person besides their name. A roster is a list of people imported from a data file.',
  },
  description: {
    id: 'protocolBuilder.cardDisplay.description',
    defaultMessage:
      'Show extra attributes on each roster card, so the participant can tell two similar people apart.',
    description:
      'Description of the card-details section. An attribute is one field the data file records about a person.',
  },
  waitingDescription: {
    id: 'protocolBuilder.cardDisplay.waitingDescription',
    defaultMessage:
      'Choose a roster data file before deciding what its cards show.',
    description:
      'Shown in place of the card-details section’s description while no data file has been chosen, so there are no columns for a card to show.',
  },
  fieldLabel: {
    id: 'protocolBuilder.cardDisplay.fieldLabel',
    defaultMessage: 'Attributes shown on a card',
    description:
      'Label of the list of extra attributes each roster card shows beneath the person’s name.',
  },
  fieldHint: {
    id: 'protocolBuilder.cardDisplay.fieldHint',
    defaultMessage:
      'Each attribute appears beneath the name, under the label you give it here.',
    description:
      'Guidance under the list of extra attributes shown on a roster card.',
  },
  addLabel: {
    id: 'protocolBuilder.cardDisplay.addLabel',
    defaultMessage: 'Add new card detail',
    description:
      'Button that adds one more attribute to what a roster card shows. Whole rather than a generic "Add", because a stage editor shows several lists at once and they would otherwise be indistinguishable to anyone navigating by a list of buttons.',
  },
  emptyState: {
    id: 'protocolBuilder.cardDisplay.emptyState',
    defaultMessage: 'No extra attributes are shown on a card.',
    description:
      'Shown in place of the list while a roster card shows nothing but the person’s name.',
  },
  titledByName: {
    id: 'protocolBuilder.cardDisplay.titledByName',
    defaultMessage:
      'Every card is titled with the person’s <strong>name</strong> from the data file. These attributes appear beneath it.',
    description:
      'Notice above the list saying which column titles a card, so a researcher does not add the name a second time. The strong tag emphasises the word for the column the interview reads as a person’s name; move the tag with the word it marks.',
  },
  attributeColumn: {
    id: 'protocolBuilder.cardDisplay.attributeColumn',
    defaultMessage: 'Attribute',
    description:
      'Heading of the column of the card-details list holding which attribute of the data file a row shows.',
  },
  labelColumn: {
    id: 'protocolBuilder.cardDisplay.labelColumn',
    defaultMessage: 'Label',
    description:
      'Heading of the column of the card-details list holding the words the participant reads beside the attribute’s value on a card.',
  },
  labelPlaceholder: {
    id: 'protocolBuilder.cardDisplay.labelPlaceholder',
    defaultMessage: 'Age',
    description:
      'Example label shown in an empty label cell of the card-details list. An example rather than an instruction, so a translation should be an equally ordinary thing a study records about a person.',
  },
  clearTitle: {
    id: 'protocolBuilder.cardDisplay.clearTitle',
    defaultMessage: 'This will clear the card details',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that chooses what the cards in a roster show about each person.',
  },
  clearDescription: {
    id: 'protocolBuilder.cardDisplay.clearDescription',
    defaultMessage:
      'This will remove every extra attribute your roster cards show, along with the labels you gave them. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching off the card details discards the chosen attributes and their labels. A roster is a list of people imported from a data file; an attribute is one field the protocol records about a person.',
  },
  clearConfirm: {
    id: 'protocolBuilder.cardDisplay.clearConfirm',
    defaultMessage: 'Clear card details',
    description:
      'Action that confirms switching the roster card details off and discarding them.',
  },
});

/**
 * The two columns of the card-details list, in the reader's own language.
 *
 * Built from a formatter rather than kept as a module constant, because a
 * `PropertyField` carries the words the researcher reads on the column heading
 * and in the empty cell beneath it.
 */
const cardPropertyColumns = (intl: IntlShape): PropertyField[] => [
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

const CARD_CAPABILITY: SectionCapability = {
  fields: [CARD_PROPERTIES],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

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
export default function CardDisplaySection() {
  const intl = useAppIntl();
  const columns = useRosterColumns();
  const orphans = useOrphanedColumns(
    'variable',
    CARD_PROPERTIES,
    columns.names,
  );
  const options = useColumnOptionGetter(columns.names, orphans.options);
  const properties = useMemo(() => cardPropertyColumns(intl), [intl]);
  const validation = useMemo(
    () => makeMultiSelectValidation(properties, orphans.dangling),
    [orphans.dangling, properties],
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
      capability={CARD_CAPABILITY}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          {/*
            The emphasis is a tag inside the sentence rather than markup around
            a fragment of it, so a translator moves the whole clause and the
            emphasised word travels with it.
          */}
          {intl.formatMessage(messages.titledByName, {
            strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
          })}
        </AlertDescription>
      </Alert>
      {/*
        Mounted whatever the data file turned out to hold, including while it
        is still being read. The stage saves its REGISTERED fields, so a list
        that stopped mounting for an already-configured value would delete it
        silently; `maxItems` of 0 hides the add control, which is all the empty
        case needs.
      */}
      {/*
        An `OptionalList`, so deleting the last row writes what the empty state
        beneath it already says: a card titled with the person's name and
        nothing else. This capability owns one list, so emptying it leaves
        `cardOptions` absent altogether, and the switch reads off when the stage
        is reopened — which is then the truth about the saved stage rather than
        a section standing open over a list of nothing.
      */}
      <ProtocolArrayField<typeof OptionalList>
        name={CARD_PROPERTIES}
        label={intl.formatMessage(messages.fieldLabel)}
        hint={intl.formatMessage(messages.fieldHint)}
        component={OptionalList}
        addButtonLabel={intl.formatMessage(messages.addLabel)}
        properties={properties}
        options={options}
        // An orphan counts: the row holding it is one of the rows this limit
        // is counting, and it has to stay removable.
        maxItems={(columns.names?.length ?? 0) + orphans.options.length}
        emptyStateMessage={intl.formatMessage(messages.emptyState)}
        {...validation}
      />
    </BuilderSection>
  );
}
