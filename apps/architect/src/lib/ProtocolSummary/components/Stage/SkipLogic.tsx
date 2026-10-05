import { useContext } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { SkipLogicDestination } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';
import { getSkipLogicDestinationLabel } from '~/utils/skipLogicDestination';

import MiniTable from '../MiniTable';
import Rules from '../Rules';
import SummaryContext from '../SummaryContext';

type FilterType = {
  join?: string;
  rules: Array<{ type: string; options: Record<string, unknown> }>;
};

type SkipLogicProps = {
  skipLogic: Record<string, unknown>;
};

const SkipLogic = ({ skipLogic }: SkipLogicProps) => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);

  if (!skipLogic) {
    return null;
  }

  const { filter, action, destination } = skipLogic as {
    filter?: FilterType;
    action?: string;
    destination?: SkipLogicDestination;
  };

  return (
    <MiniTable
      rotated
      wide
      rows={[
        [intl.formatMessage(summaryMessages.action), action],
        [
          intl.formatMessage(summaryMessages.destination),
          getSkipLogicDestinationLabel(
            protocol.stages ?? [],
            destination,
            intl,
          ),
        ],
        [
          intl.formatMessage(summaryMessages.rules),
          filter ? <Rules key="rules" filter={filter} /> : null,
        ],
      ]}
    />
  );
};

export default SkipLogic;
