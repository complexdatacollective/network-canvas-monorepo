import Rules, { type RuleSetGroupProps } from './Rules/Rules';
import type { Rule } from './Rules/validateRule';

type QueryProps = RuleSetGroupProps & {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
  /** Whole strings, required — see `Rules.tsx`. */
  addAlterRuleLabel: string;
  addEdgeRuleLabel: string;
  addEgoRuleLabel: string;
};

const Query = ({
  rules = [],
  join,
  codebook,
  onChange,
  addAlterRuleLabel,
  addEdgeRuleLabel,
  addEgoRuleLabel,
  ...groupProps
}: QueryProps) => (
  <Rules
    {...groupProps}
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    type="query"
    addAlterRuleLabel={addAlterRuleLabel}
    addEdgeRuleLabel={addEdgeRuleLabel}
    addEgoRuleLabel={addEgoRuleLabel}
  />
);

export default Query;
