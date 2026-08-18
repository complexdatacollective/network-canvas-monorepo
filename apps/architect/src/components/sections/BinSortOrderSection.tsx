import type { ReactNode } from 'react';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import MultiSelect, {
  completeRows,
  type ItemValue,
  type OptionGetter,
  type PropertyField,
} from '~/components/Form/arrayFields/MultiSelect';

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

const BinSortOrderSection = ({
  initialValue,
  disabled = false,
  maxItems = 5,
  optionGetter,
  summary = 'Enable this option to set the order that nodes appear after they have been placed into a bin.',
}: BinSortOrderSectionProps) => {
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const handleToggleChange = (nextState: boolean) => {
    if (!nextState) {
      setFieldValue('binSortOrder', undefined);
    }
    return true;
  };
  return (
    <Section
      title="Set the order of nodes in bins"
      summary={summary}
      toggleable
      disabled={disabled}
      startExpanded={!!initialValue}
      handleToggleChange={handleToggleChange}
      layout="vertical"
    >
      <>
        <ArchitectArrayField
          name="binSortOrder"
          label="Bin sort rules"
          hint="Add one or more rules to determine the order in which nodes are displayed in the bin after they have been placed. Use the asterisk property to sort by the order that nodes were placed."
          component={MultiSelect}
          emptyStateMessage="No sort rules have been created yet."
          addButtonLabel="Add new bin sort rule"
          initialValue={initialValue}
          properties={SORT_RULE_PROPERTIES}
          validation={SORT_RULE_VALIDATION}
          maxItems={maxItems}
          options={optionGetter}
        />
      </>
    </Section>
  );
};
export default BinSortOrderSection;
