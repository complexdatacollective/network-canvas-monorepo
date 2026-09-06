import type { ComponentType } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

import ProtocolField from '../form/ProtocolField.tsx';
import ResourcePickerControl from '../resources/components/ResourcePickerControl.tsx';
import BuilderSection from './BuilderSection.tsx';
import { DATA_SOURCE, useRosterColumns } from './useRosterColumns.ts';

const ResourcePicker = ResourcePickerControl as ComponentType<
  Record<string, unknown>
>;

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
  sectionTitle: 'Roster source',
  description:
    'Choose the data file listing the people this stage offers the participant.',
  fieldLabel: 'Roster data file',
  fieldHint:
    'A CSV or JSON file of people. Everything else on this stage is chosen from its columns.',
};

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
  const columns = useRosterColumns();

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof ResourcePicker>
        name={DATA_SOURCE}
        component={ResourcePicker}
        label={words.fieldLabel}
        hint={words.fieldHint}
        kind="network"
        required="Choose the data file this roster lists people from."
      />
      {columns.problem !== undefined && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>This data file could not be read</AlertTitle>
          <AlertDescription>{columns.problem}</AlertDescription>
        </Alert>
      )}
      {/*
        Said only about a file that was actually read. `names` is `undefined`
        until then — nothing chosen, still reading, or unreadable — and an
        EMPTY list is the file's own answer, which is what this warns about.
      */}
      {columns.names?.length === 0 && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>This data file has no attributes</AlertTitle>
          <AlertDescription>
            The people in it carry no attributes, so there is nothing to show on
            a card, sort by, or search. Check that the file is formatted as
            Network Canvas expects.
          </AlertDescription>
        </Alert>
      )}
      {columns.names !== undefined && columns.names.length > 0 && (
        <Alert variant="info" className="my-7">
          <AlertTitle>What this data file holds</AlertTitle>
          <AlertDescription>
            {`The people in it carry these attributes: ${columns.names.join(', ')}.`}
          </AlertDescription>
        </Alert>
      )}
    </BuilderSection>
  );
}
