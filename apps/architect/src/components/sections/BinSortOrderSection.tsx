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
    id: 'architect.defaults.components.sections.BinSortOrderSection.description',
    defaultMessage:
      'Set the order of nodes after they have been placed into a bin.',
    description:
      'Default researcher-facing copy when the caller does not supply its own description.',
  },
});
const additionalMessages = defineMessages({
  noSortRulesHaveBeenCreated: {
    id: 'architect.additional.sections.binSortOrderSection.noSortRulesHaveBeenCreated',
    defaultMessage: 'No sort rules have been created yet.',
    description:
      'The emptyStateMessage text in components / sections / BinSortOrderSection.',
  },
  addNewBinSortRule: {
    id: 'architect.additional.sections.binSortOrderSection.addNewBinSortRule',
    defaultMessage: 'Add new bin sort rule',
    description:
      'The addButtonLabel text in components / sections / BinSortOrderSection.',
  },
});
const messages = defineMessages({
  binOrder: {
    id: 'architect.sections.binSortOrderSection.binOrder',
    defaultMessage: 'Bin order',
    description:
      'The title text in components / sections / BinSortOrderSection.',
  },
  binSortRules: {
    id: 'architect.sections.binSortOrderSection.binSortRules',
    defaultMessage: 'Bin sort rules',
    description:
      'The label text in components / sections / BinSortOrderSection.',
  },
  addOneOrMoreRulesTo: {
    id: 'architect.sections.binSortOrderSection.addOneOrMoreRulesTo',
    defaultMessage:
      'Add one or more rules to determine the order in which nodes are displayed in the bin after they have been placed. Use the asterisk property to sort by the order that nodes were placed.',
    description:
      'The hint text in components / sections / BinSortOrderSection.',
  },
});

type BinSortOrderSectionProps = {
  /**
   * The row's committed `binSortOrder` value, used only to decide whether the
   * section starts expanded. Rendered inside a per-item dialog editor (its own
   * `FormStoreProvider`, remounted per editing session), which has no
   * whole-form `initialValues` to read a not-yet-mounted field from — the
   * caller (the item's `editorFieldsComponent`) supplies it from the row.
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

const BinSortOrderSection = ({
  initialValue,
  disabled = false,
  maxItems = 5,
  optionGetter,
  description: providedDescription,
}: BinSortOrderSectionProps) => {
  const intl = useAppIntl();
  const description =
    providedDescription ?? intl.formatMessage(defaultMessages.description);

  const SORT_RULE_VALIDATION = {
    completeRows: completeRows(SORT_RULE_PROPERTIES, intl),
  };
  return (
    <Section
      title={intl.formatMessage(messages.binOrder)}
      description={description}
      toggleable
      disabled={disabled}
      defaultOpen={!!initialValue}
    >
      <ArchitectArrayField
        name="binSortOrder"
        label={intl.formatMessage(messages.binSortRules)}
        hint={intl.formatMessage(messages.addOneOrMoreRulesTo)}
        component={MultiSelect}
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noSortRulesHaveBeenCreated,
        )}
        addButtonLabel={intl.formatMessage(
          additionalMessages.addNewBinSortRule,
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
export default BinSortOrderSection;
