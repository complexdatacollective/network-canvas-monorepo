import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';
const chromeMessages = defineMessages({
  unknown: {
    id: 'architect.chrome.protocolSummary.stage.quickAdd.unknown',
    defaultMessage: 'Unknown',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / QuickAdd.',
  },
});
const messages = defineMessages({
  quickAdd: {
    id: 'architect.protocolSummary.stage.quickAdd.quickAdd',
    defaultMessage: 'Quick Add',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / QuickAdd.',
  },
  attribute: {
    id: 'architect.protocolSummary.stage.quickAdd.attribute',
    defaultMessage: 'Attribute',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / QuickAdd.',
  },
  type: {
    id: 'architect.protocolSummary.stage.quickAdd.type',
    defaultMessage: 'Type',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / QuickAdd.',
  },
});

type QuickAddProps = {
  quickAdd?: string | null;
};

const QuickAdd = ({ quickAdd = null }: QuickAddProps) => {
  const intl = useAppIntl();
  const { index } = useContext(SummaryContext);

  if (!quickAdd) {
    return null;
  }

  const variableMeta = index.find(({ id }) => id === quickAdd);

  return (
    <SectionFrame title={intl.formatMessage(messages.quickAdd)}>
      <MiniTable
        rotated
        rows={[
          [
            <span key="label">{intl.formatMessage(messages.attribute)}</span>,
            <Variable key="var" id={quickAdd} />,
          ],
          [
            <span key="type-label">{intl.formatMessage(messages.type)}</span>,
            <span key="type-value">
              {variableMeta?.type || intl.formatMessage(chromeMessages.unknown)}
            </span>,
          ],
        ]}
      />
    </SectionFrame>
  );
};

export default QuickAdd;
