import Rules, { type RuleSetGroupProps } from './Rules/Rules';
import type { Rule } from './Rules/validateRule';

type QueryProps = RuleSetGroupProps & {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
};

const Query = ({
  rules = [],
  join,
  codebook,
  onChange,
  ...groupProps
}: QueryProps) => (
  <Rules
    {...groupProps}
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    type="query"
  />
);

export default Query;
