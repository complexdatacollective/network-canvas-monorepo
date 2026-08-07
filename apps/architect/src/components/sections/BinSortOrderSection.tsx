import type { ReactNode } from 'react';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
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

const getDefaultSummary = () => (
  <Paragraph>
    You may also configure one or more sort rules that determine the order that
    nodes are listed after they have been placed into a bin.
  </Paragraph>
);
const BinSortOrderSection = ({
  initialValue,
  disabled = false,
  maxItems = 5,
  optionGetter,
  summary = getDefaultSummary(),
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
      title="Bin Sort Order"
      summary={summary}
      toggleable
      disabled={disabled}
      startExpanded={!!initialValue}
      handleToggleChange={handleToggleChange}
      layout="vertical"
    >
      <Row>
        <ArchitectArrayField
          name="binSortOrder"
          label="Bin sort order"
          labelHidden
          component={MultiSelect}
          initialValue={initialValue}
          properties={SORT_RULE_PROPERTIES}
          validation={SORT_RULE_VALIDATION}
          maxItems={maxItems}
          options={optionGetter}
        />
      </Row>
    </Section>
  );
};
export default BinSortOrderSection;
