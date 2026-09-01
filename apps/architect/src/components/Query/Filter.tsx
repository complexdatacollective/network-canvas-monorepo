import Rules, { type RuleSetGroupProps } from './Rules/Rules';
import type { Rule } from './Rules/validateRule';

type FilterProps = RuleSetGroupProps & {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
  allowEdgeRules?: boolean;
  /** Whole string, required — see `Rules.tsx`. */
  addRuleLabel: string;
};

const Filter = ({
  rules = [],
  join,
  codebook,
  onChange,
  allowEdgeRules,
  addRuleLabel,
  ...groupProps
}: FilterProps) => (
  <Rules
    {...groupProps}
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    allowEdgeRules={allowEdgeRules}
    addRuleLabel={addRuleLabel}
  />
);

export default Filter;
