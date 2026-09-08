import { compose } from 'react-recompose';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import MultiSelect, {
  completeRows,
  type ItemValue,
  type PropertyField,
} from '~/components/Form/arrayFields/MultiSelect';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';

import withDisabledAssetRequired from '../../enhancers/withDisabledAssetRequired';
import getSortOrderOptionGetter from './getSortOrderOptionGetter';
import getVariableOptionsGetter from './getVariableOptionsGetter';
const additionalMessages = defineMessages({
  addNewSortRule: {
    id: 'architect.additional.sections.sortOptionsForExternalData.sortOptionsForExternalData.addNewSortRule',
    defaultMessage: 'Add new sort rule',
    description:
      'The addButtonLabel text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
  addNewSortableProperty: {
    id: 'architect.additional.sections.sortOptionsForExternalData.sortOptionsForExternalData.addNewSortableProperty',
    defaultMessage: 'Add new sortable property',
    description:
      'The addButtonLabel text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
});
const configMessages = defineMessages({
  attribute: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.config.attribute',
    defaultMessage: 'Attribute',
    description:
      'Presentation label or description in components/sections/SortOptionsForExternalData/SortOptionsForExternalData.tsx. Identifiers are not translated.',
  },
  label: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.config.label',
    defaultMessage: 'Label',
    description:
      'Presentation label or description in components/sections/SortOptionsForExternalData/SortOptionsForExternalData.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  rosterSorting: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.rosterSorting',
    defaultMessage: 'Roster sorting',
    description:
      'The title text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
  selectARosterDataSourceBefore: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.selectARosterDataSourceBefore',
    defaultMessage: 'Select a roster data source before configuring sorting.',
    description:
      'The description text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
  configureTheInitialCardOrderAnd: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.configureTheInitialCardOrderAnd',
    defaultMessage:
      'Configure the initial card order and the attributes participants can sort by.',
    description:
      'The description text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
  sortRule: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.sortRule',
    defaultMessage: 'Sort rule',
    description:
      'The label text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
  setTheRosterSInitialSortOrder: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.setTheRosterSInitialSortOrder',
    defaultMessage:
      "Set the roster's initial sort order. Without a rule, nodes keep their order from the data file.",
    description:
      'The hint text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
  sortableProperties: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.sortableProperties',
    defaultMessage: 'Sortable properties',
    description:
      'The label text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
  selectAttributesThatHelpParticipantsLocate: {
    id: 'architect.sections.sortOptionsForExternalData.sortOptionsForExternalData.selectAttributesThatHelpParticipantsLocate',
    defaultMessage:
      'Select attributes that help participants locate a specific roster member.',
    description:
      'The hint text in components / sections / SortOptionsForExternalData / SortOptionsForExternalData.',
  },
});

const SORT_ORDER_PROPERTIES: PropertyField[] = [
  { fieldName: 'property' },
  { fieldName: 'direction' },
];

const SORTABLE_PROPERTIES: MessageConfig<PropertyField>[] = [
  { fieldName: 'variable', label: configMessages.attribute },
  {
    fieldName: 'label',
    control: 'input',
    label: configMessages.label,
    placeholder: configMessages.label,
  },
];

// A row's own cells cannot block the save (see RowField), and a half-filled
// row survives `prune` to fail the roster stage's schema — which requires both
// members of a sort rule and of a sortable property.

type SortOptionsProps = StageEditorSectionProps & {
  dataSource?: string;
  disabled: boolean;
};
const SortOptions = ({ dataSource, disabled }: SortOptionsProps) => {
  const intl = useAppIntl();
  const SORT_ORDER_VALIDATION = {
    completeRows: completeRows(SORT_ORDER_PROPERTIES, intl),
  };
  const SORTABLE_PROPERTIES_VALIDATION = {
    completeRows: completeRows(formatConfig(SORTABLE_PROPERTIES, intl), intl),
  };
  const { variables: variableOptions } = useVariablesFromExternalData(
    dataSource,
    true,
  );
  const variableOptionsGetter = getVariableOptionsGetter(variableOptions);
  const maxVariableOptions = variableOptions.length;
  const sortOrderOptionGetter = getSortOrderOptionGetter(variableOptions, intl);
  const hasSortOrder = useStageFormValue('sortOptions.sortOrder') != null;
  const hasSortableProperties =
    useStageFormValue('sortOptions.sortableProperties') != null;
  const initialSortOrder = useStageInitialValue<ItemValue[]>(
    'sortOptions.sortOrder',
  );
  const initialSortableProperties = useStageInitialValue<ItemValue[]>(
    'sortOptions.sortableProperties',
  );
  return (
    <Section
      title={intl.formatMessage(messages.rosterSorting)}
      description={
        disabled
          ? intl.formatMessage(messages.selectARosterDataSourceBefore)
          : intl.formatMessage(messages.configureTheInitialCardOrderAnd)
      }
      toggleable
      defaultOpen={hasSortOrder || hasSortableProperties}
      disabled={disabled}
    >
      <ArchitectArrayField
        name="sortOptions.sortOrder"
        label={intl.formatMessage(messages.sortRule)}
        hint={intl.formatMessage(messages.setTheRosterSInitialSortOrder)}
        component={MultiSelect}
        addButtonLabel={intl.formatMessage(additionalMessages.addNewSortRule)}
        initialValue={initialSortOrder}
        maxItems={1}
        properties={SORT_ORDER_PROPERTIES}
        validation={SORT_ORDER_VALIDATION}
        options={sortOrderOptionGetter}
      />
      <ArchitectArrayField
        name="sortOptions.sortableProperties"
        label={intl.formatMessage(messages.sortableProperties)}
        hint={intl.formatMessage(
          messages.selectAttributesThatHelpParticipantsLocate,
        )}
        component={MultiSelect}
        addButtonLabel={intl.formatMessage(
          additionalMessages.addNewSortableProperty,
        )}
        initialValue={initialSortableProperties}
        maxItems={maxVariableOptions}
        properties={formatConfig(SORTABLE_PROPERTIES, intl)}
        validation={SORTABLE_PROPERTIES_VALIDATION}
        options={(fieldName: string, rowValues: unknown, allValues: unknown) =>
          variableOptionsGetter(
            fieldName,
            rowValues,
            allValues as Array<Record<string, unknown>>,
          )
        }
      />
    </Section>
  );
};

type GatedProps = StageEditorSectionProps & { dataSource?: string };

/**
 * `compose` is hoisted to module scope so the gated component keeps a stable
 * identity across renders — `dataSource` is read via `useStageFormValue` in
 * the wrapper below.
 */
const GatedSortOptions = compose<SortOptionsProps, GatedProps>(
  withDisabledAssetRequired,
)(SortOptions);

const SortOptionsForExternalData = (props: StageEditorSectionProps) => {
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  return <GatedSortOptions {...props} dataSource={dataSource} />;
};

export default SortOptionsForExternalData;
