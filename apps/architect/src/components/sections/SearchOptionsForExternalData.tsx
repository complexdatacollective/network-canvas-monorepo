import type { ComponentType } from 'react';
import { compose } from 'react-recompose';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';

import withDisabledAssetRequired from '../enhancers/withDisabledAssetRequired';
const messages = defineMessages({
  rosterSearch: {
    id: 'architect.sections.searchOptionsForExternalData.rosterSearch',
    defaultMessage: 'Roster search',
    description:
      'The title text in components / sections / SearchOptionsForExternalData.',
  },
  selectARosterDataSourceBefore: {
    id: 'architect.sections.searchOptionsForExternalData.selectARosterDataSourceBefore',
    defaultMessage: 'Select a roster data source before configuring search.',
    description:
      'The description text in components / sections / SearchOptionsForExternalData.',
  },
  configureHowParticipantsFindAndSelect: {
    id: 'architect.sections.searchOptionsForExternalData.configureHowParticipantsFindAndSelect',
    defaultMessage:
      'Configure how participants find and select nodes from the roster.',
    description:
      'The description text in components / sections / SearchOptionsForExternalData.',
  },
  searchMatching: {
    id: 'architect.sections.searchOptionsForExternalData.searchMatching',
    defaultMessage: 'Search matching',
    description:
      'The title text in components / sections / SearchOptionsForExternalData.',
  },
  chooseTheRosterAttributesConsideredWhen: {
    id: 'architect.sections.searchOptionsForExternalData.chooseTheRosterAttributesConsideredWhen',
    defaultMessage:
      "Choose the roster attributes considered when matching a participant's search.",
    description:
      'The description text in components / sections / SearchOptionsForExternalData.',
  },
  selectingLotsOfAttributesHereMay: {
    id: 'architect.sections.searchOptionsForExternalData.selectingLotsOfAttributesHereMay',
    defaultMessage:
      'Selecting lots of attributes here may slow the performance of the search feature. Select only the attributes that participants will search for.',
    description:
      'Visible text in components / sections / SearchOptionsForExternalData.',
  },
  searchableAttributes: {
    id: 'architect.sections.searchOptionsForExternalData.searchableAttributes',
    defaultMessage: 'Searchable attributes',
    description:
      'The label text in components / sections / SearchOptionsForExternalData.',
  },
  youCanConfigureWhichAttributesAre: {
    id: 'architect.sections.searchOptionsForExternalData.youCanConfigureWhichAttributesAre',
    defaultMessage:
      "You can configure which attributes are considered when matching roster nodes to the user's query.",
    description:
      'The hint text in components / sections / SearchOptionsForExternalData.',
  },
  matchTolerance: {
    id: 'architect.sections.searchOptionsForExternalData.matchTolerance',
    defaultMessage: 'Match tolerance',
    description:
      'The title text in components / sections / SearchOptionsForExternalData.',
  },
  chooseHowCloselyAParticipantSSearch: {
    id: 'architect.sections.searchOptionsForExternalData.chooseHowCloselyAParticipantSSearch',
    defaultMessage:
      "Choose how closely a participant's search must match roster text.",
    description:
      'The description text in components / sections / SearchOptionsForExternalData.',
  },
  ifTheRosterContainsManySimilar: {
    id: 'architect.sections.searchOptionsForExternalData.ifTheRosterContainsManySimilar',
    defaultMessage:
      'If the roster contains many similar nodes, selecting "Exact" or "High accuracy" will help narrow down searches. In contrast, a low accuracy search will allow for typos and spelling mistakes.',
    description:
      'Visible text in components / sections / SearchOptionsForExternalData.',
  },
  searchAccuracy: {
    id: 'architect.sections.searchOptionsForExternalData.searchAccuracy',
    defaultMessage: 'Search accuracy',
    description:
      'The label text in components / sections / SearchOptionsForExternalData.',
  },
  searchAccuracyDeterminesHowCloselyThe: {
    id: 'architect.sections.searchOptionsForExternalData.searchAccuracyDeterminesHowCloselyThe',
    defaultMessage:
      'Search accuracy determines how closely the text the participant types must be to an attribute for it to be considered a match.',
    description:
      'The hint text in components / sections / SearchOptionsForExternalData.',
  },
  lowAccuracy: {
    id: 'architect.sections.searchOptionsForExternalData.lowAccuracy',
    defaultMessage: 'Low accuracy',
    description:
      'The label text in components / sections / SearchOptionsForExternalData.',
  },
  mediumAccuracy: {
    id: 'architect.sections.searchOptionsForExternalData.mediumAccuracy',
    defaultMessage: 'Medium accuracy',
    description:
      'The label text in components / sections / SearchOptionsForExternalData.',
  },
  highAccuracy: {
    id: 'architect.sections.searchOptionsForExternalData.highAccuracy',
    defaultMessage: 'High accuracy',
    description:
      'The label text in components / sections / SearchOptionsForExternalData.',
  },
  exact: {
    id: 'architect.sections.searchOptionsForExternalData.exact',
    defaultMessage: 'Exact',
    description:
      'The label text in components / sections / SearchOptionsForExternalData.',
  },
});

const FrescoCheckboxGroupField = CheckboxGroupField as ComponentType<
  Record<string, unknown>
>;
const FrescoLikertScaleField = LikertScaleField as ComponentType<
  Record<string, unknown>
>;

type SearchOptionsProps = StageEditorSectionProps & {
  dataSource?: string;
  disabled: boolean;
};
const SearchOptions = ({ dataSource, disabled }: SearchOptionsProps) => {
  const intl = useAppIntl();
  const { variables: variableOptions } = useVariablesFromExternalData(
    dataSource,
    true,
  );
  // Presence is read from the actual leaf fields, not the `searchOptions`
  // parent, which is never itself a registered field. This determines the
  // initial open state from the values the section actually owns.
  const matchProperties = useStageFormValue('searchOptions.matchProperties');
  const fuzziness = useStageFormValue('searchOptions.fuzziness');
  const hasSearchOptions = matchProperties != null || fuzziness != null;
  const initialMatchProperties = useStageInitialValue<string[]>(
    'searchOptions.matchProperties',
  );
  const initialFuzziness = useStageInitialValue<number>(
    'searchOptions.fuzziness',
  );
  return (
    <Section
      title={intl.formatMessage(messages.rosterSearch)}
      description={
        disabled
          ? intl.formatMessage(messages.selectARosterDataSourceBefore)
          : intl.formatMessage(messages.configureHowParticipantsFindAndSelect)
      }
      toggleable
      defaultOpen={hasSearchOptions}
      disabled={disabled}
    >
      <Section
        title={intl.formatMessage(messages.searchMatching)}
        description={intl.formatMessage(
          messages.chooseTheRosterAttributesConsideredWhen,
        )}
      >
        <Alert variant="info" className="my-7">
          <AlertDescription>
            {intl.formatMessage(messages.selectingLotsOfAttributesHereMay)}
          </AlertDescription>
        </Alert>
        <ArchitectField
          name="searchOptions.matchProperties"
          component={FrescoCheckboxGroupField}
          initialValue={initialMatchProperties}
          validation={{ minSelected: 1 }}
          label={intl.formatMessage(messages.searchableAttributes)}
          hint={intl.formatMessage(messages.youCanConfigureWhichAttributesAre)}
          options={variableOptions}
        />
      </Section>
      <Section
        title={intl.formatMessage(messages.matchTolerance)}
        description={intl.formatMessage(
          messages.chooseHowCloselyAParticipantSSearch,
        )}
      >
        <Alert variant="info" className="my-7">
          <AlertDescription>
            {intl.formatMessage(messages.ifTheRosterContainsManySimilar)}
          </AlertDescription>
        </Alert>
        <ArchitectField
          name="searchOptions.fuzziness"
          component={FrescoLikertScaleField}
          initialValue={initialFuzziness}
          validation={{ requiredAcceptsZero: true }}
          label={intl.formatMessage(messages.searchAccuracy)}
          hint={intl.formatMessage(
            messages.searchAccuracyDeterminesHowCloselyThe,
          )}
          options={[
            { value: 0.75, label: intl.formatMessage(messages.lowAccuracy) },
            { value: 0.5, label: intl.formatMessage(messages.mediumAccuracy) },
            { value: 0.25, label: intl.formatMessage(messages.highAccuracy) },
            { value: 0, label: intl.formatMessage(messages.exact) },
          ]}
        />
      </Section>
    </Section>
  );
};
type GatedProps = StageEditorSectionProps & { dataSource?: string };

/**
 * `compose` is hoisted to module scope so the gated component keeps a stable
 * identity across renders — `dataSource` is read via `useStageFormValue` in
 * the wrapper below.
 */
const GatedSearchOptions = compose<SearchOptionsProps, GatedProps>(
  withDisabledAssetRequired,
)(SearchOptions);

const SearchOptionsForExternalData = (props: StageEditorSectionProps) => {
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  return <GatedSearchOptions {...props} dataSource={dataSource} />;
};

export default SearchOptionsForExternalData;
