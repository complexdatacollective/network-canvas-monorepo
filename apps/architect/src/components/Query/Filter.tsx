import Rules from './Rules';
import type { Rule } from './Rules/validateRule';

type FilterProps = {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
  error?: string;
  allowEdgeRules?: boolean;
};

const Filter = ({
  rules = [],
  join,
  codebook,
  onChange,
  error,
  allowEdgeRules,
}: FilterProps) => (
  <Rules
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    error={error}
    allowEdgeRules={allowEdgeRules}
  />
);

export default Filter;
