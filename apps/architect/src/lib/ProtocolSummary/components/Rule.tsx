import { compose } from 'react-recompose';

import RuleText from '~/components/Query/Rules/PreviewText';
import withDisplayOptions from '~/components/Query/Rules/withDisplayOptions';

type RuleProps = {
  type: string;
  options: Record<string, unknown>;
  codebook?: unknown;
};

const Rule = ({ type, options }: RuleProps) => (
  <RuleText type={type} options={options} variant="summary" />
);

// The withDisplayOptions HOC will inject the codebook prop
export default compose<RuleProps, RuleProps & { codebook: unknown }>(
  withDisplayOptions,
)(Rule);
