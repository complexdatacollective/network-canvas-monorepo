import Rules from './Rules';
import type { Rule } from './Rules/validateRule';

type QueryProps = {
  onChange: (value: unknown) => void;
  rules?: Rule[];
  codebook: Record<string, unknown>;
  join?: string;
  error?: string;
  meta?: Record<string, unknown>;
};

const Query = ({
  rules = [],
  join,
  codebook,
  onChange,
  error,
  meta = {},
}: QueryProps) => (
  <Rules
    meta={meta}
    rules={rules}
    join={join}
    onChange={onChange}
    codebook={codebook}
    type="query"
    error={error}
  />
);

export default Query;
