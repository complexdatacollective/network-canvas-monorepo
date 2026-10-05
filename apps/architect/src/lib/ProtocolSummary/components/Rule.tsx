import { useAppIntl } from '@codaco/app-i18n/react';
import { describeRule } from '@codaco/protocol-builder/rules/ruleDescription';
import RulePreview from '@codaco/protocol-builder/rules/RulePreview';
import type { Codebook } from '@codaco/protocol-validation';

type RuleProps = {
  /** A stored rule, exactly as the protocol holds it. */
  rule: unknown;
  codebook: Codebook;
};

/**
 * One rule of a filter, read back as a sentence in the printable summary.
 *
 * Both the sentence and the markup come from the builder package, which is
 * where the rule list the researcher edits gets them: a summary that resolved
 * the codebook itself is a second answer to what a rule says, and the two had
 * already disagreed about whether the ego "has" or is "where" an attribute.
 */
const Rule = ({ rule, codebook }: RuleProps) => {
  const intl = useAppIntl();

  return (
    <RulePreview
      description={describeRule({ rule, codebook, intl })}
      variant="summary"
    />
  );
};

export default Rule;
