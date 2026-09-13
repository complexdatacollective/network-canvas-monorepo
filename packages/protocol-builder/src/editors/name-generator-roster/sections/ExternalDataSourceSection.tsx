import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';

import AssetPickerField from '../../../fields/AssetPickerField.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { DATA_SOURCE, useRosterColumns } from './rosterColumns.ts';

/**
 * A roster lists people out of an imported network file, so this field takes
 * the same kind a side panel's own external source does.
 */
const ROSTER_SOURCE_KIND = 'network' as const;

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.externalDataSource.title',
    defaultMessage: 'Roster source',
    description:
      'Heading of the section choosing the data file a roster stage lists people from. A roster is a list of people imported from a data file rather than named by the participant.',
  },
  description: {
    id: 'protocolBuilder.externalDataSource.description',
    defaultMessage:
      'Select the network data file that supplies nodes for this roster.',
    description:
      'Description of the roster-source section. A stage is one step of an interview.',
  },
  fieldLabel: {
    id: 'protocolBuilder.externalDataSource.fieldLabel',
    defaultMessage: 'Roster data source',
    description:
      'Label of the control choosing which imported data file the roster lists people from.',
  },
  fieldHint: {
    id: 'protocolBuilder.externalDataSource.fieldHint',
    defaultMessage:
      'This stage needs a source of nodes to populate the roster. Select a network data file to use.',
    description:
      'Guidance under the roster data-file control. A stage is one step of an interview.',
  },
  fieldRequired: {
    id: 'protocolBuilder.externalDataSource.fieldRequired',
    defaultMessage: 'Choose the data file this roster lists people from.',
    description:
      'Refusal shown when a researcher saves a roster stage without choosing a data file, which leaves the stage with nobody to offer.',
  },
  unreadableTitle: {
    id: 'protocolBuilder.externalDataSource.unreadableTitle',
    defaultMessage: 'This data file could not be read',
    description:
      'Warning heading shown when the chosen data file could not be opened. The reason underneath comes from the application hosting this editor.',
  },
  noColumnsTitle: {
    id: 'protocolBuilder.externalDataSource.noColumnsTitle',
    defaultMessage: 'This data file has no attributes',
    description:
      'Warning heading shown when the chosen data file was read and its people carry no attributes at all. An attribute is one field the file records about a person.',
  },
  noColumnsDescription: {
    id: 'protocolBuilder.externalDataSource.noColumnsDescription',
    defaultMessage:
      'The people in it carry no attributes, so there is nothing to show on a card, sort by, or search. Check that the file is formatted as Network Canvas expects.',
    description:
      'Warning body shown when the chosen data file’s people carry no attributes, naming the three things the rest of the stage would have chosen from them. Network Canvas is the product name and is not translated.',
  },
  columnsTitle: {
    id: 'protocolBuilder.externalDataSource.columnsTitle',
    defaultMessage: 'What this data file holds',
    description:
      'Heading of the notice listing the attributes the chosen data file’s people carry.',
  },
  columnsDescription: {
    id: 'protocolBuilder.externalDataSource.columnsDescription',
    defaultMessage: 'The people in it carry these attributes: {names}.',
    description:
      'Body of the notice listing the attributes the chosen data file’s people carry. names is the column headings read out of the file, already joined into a list in the reader’s own language; they are the researcher’s own words and are never translated.',
  },
});

const CHOOSE_A_FILE = createMessageError(messages.fieldRequired);

/**
 * Where a roster stage's people come from.
 *
 * The stage has nothing to show without one, so this is required rather than
 * an optional capability — and it is the first thing a researcher configures,
 * because every other roster section is chosen from this file's columns.
 *
 * What the file contains is read through the resource gateway and summarised
 * here, so a researcher comparing two similarly named rosters can tell which
 * one they have chosen without opening it.
 */
export default function ExternalDataSourceSection() {
  const intl = useAppIntl();
  const columns = useRosterColumns();

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
    >
      <Field<typeof AssetPickerField>
        name={DATA_SOURCE}
        component={AssetPickerField}
        label={intl.formatMessage(messages.fieldLabel)}
        hint={intl.formatMessage(messages.fieldHint)}
        kind={ROSTER_SOURCE_KIND}
        required={CHOOSE_A_FILE}
      />
      {columns.problem !== undefined && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.unreadableTitle)}
          </AlertTitle>
          {/*
            The gateway's own words, decoded where they are read: a failure
            message crosses a string-only contract, so an adapter that encoded
            a descriptor gets it back in the reader's language, and a host that
            wrote a plain sentence gets exactly that sentence.
          */}
          <AlertDescription>
            {formatMessageError(columns.problem, intl) ?? columns.problem}
          </AlertDescription>
        </Alert>
      )}
      {/*
        Said only about a file that was actually read. `names` is `undefined`
        until then — nothing chosen, still reading, or unreadable — and an
        EMPTY list is the file's own answer, which is what this warns about.
      */}
      {columns.names?.length === 0 && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>{intl.formatMessage(messages.noColumnsTitle)}</AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.noColumnsDescription)}
          </AlertDescription>
        </Alert>
      )}
      {columns.names !== undefined && columns.names.length > 0 && (
        <Alert variant="info" className="my-7">
          <AlertTitle>{intl.formatMessage(messages.columnsTitle)}</AlertTitle>
          <AlertDescription>
            {/*
              Joined through `formatList` rather than with a comma: how a list
              of things reads is a fact about the reader's language — English
              puts "and" before the last one, and other languages neither use
              that word nor put it there.
            */}
            {intl.formatMessage(messages.columnsDescription, {
              names: intl.formatList([...columns.names]),
            })}
          </AlertDescription>
        </Alert>
      )}
    </BuilderSection>
  );
}
