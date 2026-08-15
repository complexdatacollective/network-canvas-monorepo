import Rules, { type RuleSetGroupProps } from './Rules/Rules';
import type { Rule } from './Rules/validateRule';

type FilterProps = RuleSetGroupProps & {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
  allowEdgeRules?: boolean;
  /**
   * Whole strings, required — see `Rules.tsx`. A filter offers no ego rules,
   * so there is no ego label to supply.
   */
  addAlterRuleLabel: string;
  addEdgeRuleLabel: string;
};

const Filter = ({
  rules = [],
  join,
  codebook,
  onChange,
  allowEdgeRules,
  addAlterRuleLabel,
  addEdgeRuleLabel,
  ...groupProps
}: FilterProps) => (
  <Rules
    {...groupProps}
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    allowEdgeRules={allowEdgeRules}
    addAlterRuleLabel={addAlterRuleLabel}
    addEdgeRuleLabel={addEdgeRuleLabel}
  />
);

export default Filter;
