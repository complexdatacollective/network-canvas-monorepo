import type { ReactNode } from 'react';

import Section from '@codaco/fresco-ui/Section';
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
  description?: ReactNode;
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

const BucketSortOrderSection = ({
  initialValue,
  disabled = false,
  maxItems = 5,
  optionGetter,
  description = 'Set the order of nodes before they are placed.',
}: BucketSortOrderSectionProps) => {
  return (
    <Section
      title="Bucket order"
      description={description}
      toggleable
      disabled={disabled}
      defaultOpen={!!initialValue}
    >
      <ArchitectArrayField
        name="bucketSortOrder"
        label="Bucket sort rules"
        hint="Add one or more rules to determine the order in which nodes are displayed in the bucket before they are placed. Use the asterisk property to sort by the order that nodes were created."
        component={MultiSelect}
        emptyStateMessage="No sort rules have been created yet."
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
