import type { ComponentType } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

import ProtocolField from '../form/ProtocolField.tsx';
import ResourcePickerControl from '../resources/components/ResourcePickerControl.tsx';
import BuilderSection from './BuilderSection.tsx';
import { DATA_SOURCE, useRosterColumns } from './useRosterColumns.ts';

const ResourcePicker = ResourcePickerControl as ComponentType<
  Record<string, unknown>
>;

export type ExternalDataSourceCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
}>;

const DEFAULT_COPY: ExternalDataSourceCopy = {
  sectionTitle: 'Roster source',
  description:
    'Choose the data file listing the people this stage offers the participant.',
  fieldLabel: 'Roster data file',
  fieldHint:
    'A CSV or JSON file of people. Everything else on this stage is chosen from its columns.',
};

export type ExternalDataSourceSectionProps = Readonly<{
  copy?: Partial<ExternalDataSourceCopy>;
}>;

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
export default function ExternalDataSourceSection({
  copy,
}: ExternalDataSourceSectionProps = {}) {
  const words = { ...DEFAULT_COPY, ...copy };
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
      {columns.problem === undefined &&
        !columns.waiting &&
        !columns.busy &&
        columns.names.length === 0 && (
          <Alert variant="warning" className="my-7">
            <AlertTitle>This data file has no attributes</AlertTitle>
            <AlertDescription>
              The people in it carry no attributes, so there is nothing to show
              on a card, sort by, or search. Check that the file is formatted as
              Network Canvas expects.
            </AlertDescription>
          </Alert>
        )}
      {columns.names.length > 0 && (
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
