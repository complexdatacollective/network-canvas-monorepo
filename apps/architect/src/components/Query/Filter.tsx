import Rules, { type RuleSetGroupProps } from './Rules/Rules';
import type { Rule } from './Rules/validateRule';

type FilterProps = RuleSetGroupProps & {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
  allowEdgeRules?: boolean;
};

const Filter = ({
  rules = [],
  join,
  codebook,
  onChange,
  allowEdgeRules,
  ...groupProps
}: FilterProps) => (
  <Rules
    {...groupProps}
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    allowEdgeRules={allowEdgeRules}
  />
);

export default Filter;
