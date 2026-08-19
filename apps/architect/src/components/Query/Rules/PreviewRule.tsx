import RuleText, { type PreviewTextOptions } from './PreviewText';

type PreviewRuleProps = {
  id?: string;
  type: string;
  /**
   * Already resolved against the codebook — see `getRuleDisplayOptions`. This
   * component only renders; the caller that HAS the codebook does the lookup.
   */
  options: PreviewTextOptions;
};

const PreviewRule = ({ id, type, options }: PreviewRuleProps) => (
  <span
    id={id}
    className="block w-full min-w-0 leading-[2.5] text-wrap [&_.variable-pill]:zoom-[0.8]"
  >
    <RuleText type={type} options={options} />
  </span>
);

export default PreviewRule;
