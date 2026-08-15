import type { ReactNode } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import MultiSelect, {
  completeRows,
  type ItemValue,
  type OptionGetter,
  type PropertyField,
} from '~/components/Form/arrayFields/MultiSelect';

type BucketSortOrderSectionProps = {
  /**
   * The row's committed `bucketSortOrder` value, used only to decide whether
   * the section starts expanded — see `BinSortOrderSection`'s `initialValue`
   * doc for why this can't be read reactively from form state here.
   */
  initialValue?: ItemValue[];
  disabled?: boolean;
  maxItems?: number;
  optionGetter: OptionGetter;
  summary?: ReactNode;
};
const SORT_RULE_PROPERTIES: PropertyField[] = [
  { fieldName: 'property' },
  { fieldName: 'direction' },
];

// A row's own cells cannot block the save (see RowField), and a rule missing
// its direction fails `SortRuleSchema` after `prune`.
const SORT_RULE_VALIDATION = {
  completeRows: completeRows(SORT_RULE_PROPERTIES),
};

const getDefaultSummary = () => (
  <Paragraph>
    Nodes are stacked in the bucket before they are placed by the participant.
    You may optionally configure a list of rules to determine how nodes are
    sorted in the bucket when the task starts, which will determine the order
    that your participant places them into bins. Interviewer will default to
    using the order in which nodes were named.
  </Paragraph>
);
const BucketSortOrderSection = ({
  initialValue,
  disabled = false,
  maxItems = 5,
  optionGetter,
  summary = getDefaultSummary(),
}: BucketSortOrderSectionProps) => {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const handleToggleChange = (nextState: boolean) => {
    if (!nextState) {
      setFieldValue('bucketSortOrder', undefined);
    }
    return true;
  };
  return (
    <Section
      title="Bucket Sort Order"
      summary={summary}
      toggleable
      disabled={disabled}
      startExpanded={!!initialValue}
      handleToggleChange={handleToggleChange}
      layout="vertical"
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          Use the asterisk property to sort by the order that nodes were
          created.
        </AlertDescription>
      </Alert>
      <ArchitectArrayField
        name="bucketSortOrder"
        label="Bucket sort order"
        labelHidden
        component={MultiSelect}
        addButtonLabel="Add new bucket sort rule"
        initialValue={initialValue}
        properties={SORT_RULE_PROPERTIES}
        validation={SORT_RULE_VALIDATION}
        maxItems={maxItems}
        options={optionGetter}
      />
    </Section>
  );
};
export default BucketSortOrderSection;
