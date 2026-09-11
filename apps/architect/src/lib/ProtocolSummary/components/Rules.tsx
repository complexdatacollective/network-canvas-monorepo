import React, { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Rule from './Rule';
import SummaryContext from './SummaryContext';

const messages = defineMessages({
  join: {
    id: 'architect.query.sentence.join',
    defaultMessage: '{join, select, AND {and} OR {or} other {}}',
    description:
      'How adjacent network-filter rules combine. AND and OR are protocol identifiers; translate their displayed labels only.',
  },
});

type JoinProps = {
  value?: string;
};

/**
 * The printable-summary separator between two rules, reading how they combine
 * ("and"/"or"). The editable rule list keeps this information in its Rule
 * Matching field instead of repeating it between cards.
 */
const Join = ({ value = '' }: JoinProps) => {
  const intl = useAppIntl();
  return (
    <div className="w-full py-5 text-center text-current/70 uppercase italic">
      {intl.formatMessage(messages.join, { join: value })}
    </div>
  );
};

type FilterType = {
  join?: string;
  rules: Array<{
    type: string;
    options: Record<string, unknown>;
  }>;
} | null;

type RulesProps = {
  filter?: FilterType;
};

const Rules = ({ filter = null }: RulesProps) => {
  const { protocol } = useContext(SummaryContext);

  if (!filter) {
    return null;
  }

  const { join, rules } = filter;

  return (
    <div>
      {rules.map((rule, index) => {
        const key = `rule-${rule.type}-${JSON.stringify(rule.options)}`;
        return (
          <React.Fragment key={key}>
            <div className="flex w-full grow items-center gap-6 not-last:mb-2.5">
              <Rule rule={rule} codebook={protocol.codebook} />
            </div>
            {index !== rules.length - 1 && join && <Join value={join} />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Rules;
