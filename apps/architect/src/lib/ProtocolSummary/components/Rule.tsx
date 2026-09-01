import RuleText from '~/components/Query/Rules/PreviewText';
import { getRuleDisplayOptions } from '~/components/Query/Rules/withDisplayOptions';

type RuleProps = {
  type: string;
  options: Record<string, unknown>;
  codebook?: unknown;
};

const Rule = ({ type, options, codebook }: RuleProps) => (
  <RuleText
    type={type}
    options={getRuleDisplayOptions({ type, options, codebook })}
    variant="summary"
  />
);

export default Rule;
