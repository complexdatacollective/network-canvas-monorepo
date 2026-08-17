import { compose } from 'react-recompose';

import RuleText from './PreviewText';
import withDisplayOptions from './withDisplayOptions';

type PreviewRuleProps = {
  id?: string;
  type: string;
  options: Record<string, unknown>;
  codebook?: Record<string, unknown>;
};

export const PreviewRule = ({ id, type, options }: PreviewRuleProps) => {
  return (
    <span
      id={id}
      className="flex w-full min-w-0 items-center text-wrap *:mx-2.5 *:max-w-[24rem] [&_.variable-pill]:zoom-[0.8]"
    >
      <RuleText type={type} options={options} />
    </span>
  );
};

export default compose<PreviewRuleProps, Partial<PreviewRuleProps>>(
  withDisplayOptions,
)(PreviewRule);
