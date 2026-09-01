import { compose } from 'react-recompose';

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

import withDisabledAssetRequired from '../../enhancers/withDisabledAssetRequired';
import getSortOrderOptionGetter from './getSortOrderOptionGetter';
import getVariableOptionsGetter from './getVariableOptionsGetter';

const SORT_ORDER_PROPERTIES: PropertyField[] = [
  { fieldName: 'property' },
  { fieldName: 'direction' },
];

const SORTABLE_PROPERTIES: PropertyField[] = [
  { fieldName: 'variable', label: 'Attribute' },
  {
    fieldName: 'label',
    control: 'input',
    label: 'Label',
    placeholder: 'Label',
  },
];

// A row's own cells cannot block the save (see RowField), and a half-filled
// row survives `prune` to fail the roster stage's schema — which requires both
// members of a sort rule and of a sortable property.
const SORT_ORDER_VALIDATION = {
  completeRows: completeRows(SORT_ORDER_PROPERTIES),
};
const SORTABLE_PROPERTIES_VALIDATION = {
  completeRows: completeRows(SORTABLE_PROPERTIES),
};

type SortOptionsProps = StageEditorSectionProps & {
  dataSource?: string;
  disabled: boolean;
};
const SortOptions = ({ dataSource, disabled }: SortOptionsProps) => {
  const { variables: variableOptions } = useVariablesFromExternalData(
    dataSource,
    true,
  );
  const variableOptionsGetter = getVariableOptionsGetter(variableOptions);
  const maxVariableOptions = variableOptions.length;
  const sortOrderOptionGetter = getSortOrderOptionGetter(variableOptions);
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
      title="Roster sorting"
      description={
        disabled
          ? 'Select a roster data source before configuring sorting.'
          : 'Configure the initial card order and the attributes participants can sort by.'
      }
      toggleable
      defaultOpen={hasSortOrder || hasSortableProperties}
      disabled={disabled}
    >
      <ArchitectArrayField
        name="sortOptions.sortOrder"
        label="Sort rule"
        hint="Set the roster's initial sort order. Without a rule, nodes keep their order from the data file."
        component={MultiSelect}
        addButtonLabel="Add new sort rule"
        initialValue={initialSortOrder}
        maxItems={1}
        properties={SORT_ORDER_PROPERTIES}
        validation={SORT_ORDER_VALIDATION}
        options={sortOrderOptionGetter}
      />
      <ArchitectArrayField
        name="sortOptions.sortableProperties"
        label="Sortable properties"
        hint="Select attributes that help participants locate a specific roster member."
        component={MultiSelect}
        addButtonLabel="Add new sortable property"
        initialValue={initialSortableProperties}
        maxItems={maxVariableOptions}
        properties={SORTABLE_PROPERTIES}
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
