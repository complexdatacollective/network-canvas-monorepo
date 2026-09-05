import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import MultiSelect, {
  completeRows,
  type ItemValue,
  type OptionGetter,
  type PropertyField,
} from '~/components/Form/arrayFields/MultiSelect';
const defaultMessages = defineMessages({
  description: {
    id: 'architect.defaults.components.sections.BucketSortOrderSection.description',
    defaultMessage: 'Set the order of nodes before they are placed.',
    description:
      'Default researcher-facing copy when the caller does not supply its own description.',
  },
});
const additionalMessages = defineMessages({
  noSortRulesHaveBeenCreated: {
    id: 'architect.additional.sections.bucketSortOrderSection.noSortRulesHaveBeenCreated',
    defaultMessage: 'No sort rules have been created yet.',
    description:
      'The emptyStateMessage text in components / sections / BucketSortOrderSection.',
  },
  addNewBucketSortRule: {
    id: 'architect.additional.sections.bucketSortOrderSection.addNewBucketSortRule',
    defaultMessage: 'Add new bucket sort rule',
    description:
      'The addButtonLabel text in components / sections / BucketSortOrderSection.',
  },
});
const messages = defineMessages({
  bucketOrder: {
    id: 'architect.sections.bucketSortOrderSection.bucketOrder',
    defaultMessage: 'Bucket order',
    description:
      'The title text in components / sections / BucketSortOrderSection.',
  },
  bucketSortRules: {
    id: 'architect.sections.bucketSortOrderSection.bucketSortRules',
    defaultMessage: 'Bucket sort rules',
    description:
      'The label text in components / sections / BucketSortOrderSection.',
  },
  addOneOrMoreRulesTo: {
    id: 'architect.sections.bucketSortOrderSection.addOneOrMoreRulesTo',
    defaultMessage:
      'Add one or more rules to determine the order in which nodes are displayed in the bucket before they are placed. Use the asterisk property to sort by the order that nodes were created.',
    description:
      'The hint text in components / sections / BucketSortOrderSection.',
  },
});

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

const BucketSortOrderSection = ({
  initialValue,
  disabled = false,
  maxItems = 5,
  optionGetter,
  description: providedDescription,
}: BucketSortOrderSectionProps) => {
  const intl = useAppIntl();
  const description =
    providedDescription ?? intl.formatMessage(defaultMessages.description);

  const SORT_RULE_VALIDATION = {
    completeRows: completeRows(SORT_RULE_PROPERTIES, intl),
  };
  return (
    <Section
      title={intl.formatMessage(messages.bucketOrder)}
      description={description}
      toggleable
      disabled={disabled}
      defaultOpen={!!initialValue}
    >
      <ArchitectArrayField
        name="bucketSortOrder"
        label={intl.formatMessage(messages.bucketSortRules)}
        hint={intl.formatMessage(messages.addOneOrMoreRulesTo)}
        component={MultiSelect}
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noSortRulesHaveBeenCreated,
        )}
        addButtonLabel={intl.formatMessage(
          additionalMessages.addNewBucketSortRule,
        )}
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
