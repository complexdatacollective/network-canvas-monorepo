import Rules, { type RuleSetGroupProps } from './Rules/Rules';
import type { Rule } from './Rules/validateRule';

type QueryProps = RuleSetGroupProps & {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
  /** Whole strings, required — see `Rules.tsx`. */
  addRuleLabel: string;
};

const Query = ({
  rules = [],
  join,
  codebook,
  onChange,
  addRuleLabel,
  ...groupProps
}: QueryProps) => (
  <Rules
    {...groupProps}
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    type="query"
    addRuleLabel={addRuleLabel}
  />
);

export default Query;
