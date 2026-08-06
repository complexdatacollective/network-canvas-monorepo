import { compose } from 'react-recompose';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import MultiSelect, {
  type ItemValue,
} from '~/components/Form/arrayFields/MultiSelect';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';

import withDisabledAssetRequired from '../../enhancers/withDisabledAssetRequired';
import getSortOrderOptionGetter from './getSortOrderOptionGetter';
import getVariableOptionsGetter from './getVariableOptionsGetter';

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
  const setStageValue = useSetStageValue();
  const hasSortOrder = useStageFormValue('sortOptions.sortOrder') != null;
  const hasSortableProperties =
    useStageFormValue('sortOptions.sortableProperties') != null;
  const initialSortOrder = useStageInitialValue<ItemValue[]>(
    'sortOptions.sortOrder',
  );
  const initialSortableProperties = useStageInitialValue<ItemValue[]>(
    'sortOptions.sortableProperties',
  );
  const handleToggleSortOptions = (nextState: boolean) => {
    if (!nextState) {
      // Clear both LEAF paths, not the `sortOptions` parent: `sortOptions`
      // itself is never a registered field (only its two children are), and
      // the store has no hierarchical relationship between a path and its
      // sub-paths — writing the parent would not reach either child.
      setStageValue('sortOptions.sortOrder', undefined);
      setStageValue('sortOptions.sortableProperties', undefined);
    }
    return true;
  };
  return (
    <Section
      title="Sort Options"
      summary={
        <Paragraph>
          Your roster will be presented to the interview participant as a list
          of cards. You may configure the sort options of this list, including
          which attributes are available for the participant to sort by during
          the interview.
        </Paragraph>
      }
      toggleable
      startExpanded={hasSortOrder || hasSortableProperties}
      handleToggleChange={handleToggleSortOptions}
      disabled={disabled}
    >
      <Row>
        <Heading level="h4">Initial Sort Order</Heading>
        <Paragraph>
          Create one or more rules to determine the default sort order or the
          roster, when it is first shown to the participant. By default,
          Interviewer will use the order that nodes are defined in your data
          file.
        </Paragraph>
        <ArchitectArrayField
          name="sortOptions.sortOrder"
          label="Initial sort order"
          labelHidden
          component={MultiSelect}
          initialValue={initialSortOrder}
          maxItems={1}
          properties={[{ fieldName: 'property' }, { fieldName: 'direction' }]}
          options={sortOrderOptionGetter}
        />
      </Row>
      <Row>
        <Heading level="h4">Participant Sortable Properties</Heading>
        <Paragraph>
          This interface allows the participant to sort the roster, to help with
          locating a specific member. Select one or more attributes from your
          roster that the participant can use to sort the list.
        </Paragraph>
        <ArchitectArrayField
          name="sortOptions.sortableProperties"
          label="Participant sortable properties"
          labelHidden
          component={MultiSelect}
          initialValue={initialSortableProperties}
          maxItems={maxVariableOptions}
          properties={[
            { fieldName: 'variable' },
            {
              fieldName: 'label',
              control: 'input',
              label: 'Label',
              placeholder: 'Label',
            },
          ]}
          options={(
            fieldName: string,
            rowValues: unknown,
            allValues: unknown,
          ) =>
            variableOptionsGetter(
              fieldName,
              rowValues,
              allValues as Array<Record<string, unknown>>,
            )
          }
        />
      </Row>
    </Section>
  );
};

type GatedProps = StageEditorSectionProps & { dataSource?: string };

/**
 * `compose` is hoisted to module scope so the gated component keeps a stable
 * identity across renders — `dataSource` (the redux-form `withMapFormToProps`
 * replacement) is read via `useStageFormValue` in the wrapper below.
 */
const GatedSortOptions = compose<SortOptionsProps, GatedProps>(
  withDisabledAssetRequired,
)(SortOptions);

const SortOptionsForExternalData = (props: StageEditorSectionProps) => {
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  return <GatedSortOptions {...props} dataSource={dataSource} />;
};

export default SortOptionsForExternalData;
