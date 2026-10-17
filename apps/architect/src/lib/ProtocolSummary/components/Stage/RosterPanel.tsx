import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import MiniTable from '../MiniTable';
import { SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  rosterPanel: {
    id: 'architect.protocolSummary.stage.rosterPanel.rosterPanel',
    defaultMessage: 'Roster panel',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / RosterPanel: the panel listing the people a roster name generator offers.',
  },
});

type RosterPanelProps = {
  panelTitle?: LocalizedString | null;
};

/** The heading a roster name generator shows over the people it offers. */
const RosterPanel = ({ panelTitle = null }: RosterPanelProps) => {
  const intl = useAppIntl();
  if (!panelTitle) {
    return null;
  }
  return (
    <SectionFrame title={intl.formatMessage(messages.rosterPanel)}>
      <MiniTable
        rotated
        rows={[
          [
            intl.formatMessage(summaryMessages.title),
            <SummaryText key="title" value={panelTitle} />,
          ],
        ]}
      />
    </SectionFrame>
  );
};

export default RosterPanel;
