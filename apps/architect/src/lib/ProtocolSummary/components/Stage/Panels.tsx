import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
// TODO: add filter
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Panel } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import AssetBadge from '../AssetBadge';
import MiniTable from '../MiniTable';
import { SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  panels: {
    id: 'architect.protocolSummary.stage.panels.panels',
    defaultMessage: 'Panels',
    description:
      'Section heading in the printable protocol summary, above the list of side panels shown on a name generator stage.',
  },
  existingNetwork: {
    id: 'architect.protocolSummary.stage.panels.existingNetwork',
    defaultMessage: 'Existing network',
    description:
      "Value in the data source row of a panel in the printable protocol summary, meaning the panel lists nodes already in the participant's network rather than an uploaded file.",
  },
});

type PanelsProps = {
  panels?: Panel[] | null;
};
const Panels = ({ panels = null }: PanelsProps) => {
  const intl = useAppIntl();
  if (!panels || panels.length === 0) {
    return null;
  }
  return (
    <SectionFrame title={intl.formatMessage(messages.panels)}>
      <ol className="m-0 ps-10">
        {panels.map((panel) => (
          <li className="my-5 ps-5" key={panel.id}>
            <MiniTable
              rotated
              rows={[
                [
                  intl.formatMessage(summaryMessages.title),
                  <SummaryText key="title" value={panel.title} />,
                ],
                [
                  intl.formatMessage(summaryMessages.dataSource),
                  panel.dataSource === 'existing' ? (
                    <Paragraph key="existing">
                      <em>{intl.formatMessage(messages.existingNetwork)}</em>
                    </Paragraph>
                  ) : (
                    <AssetBadge key="asset" id={panel.dataSource} link />
                  ),
                ],
              ]}
            />
          </li>
        ))}
      </ol>
    </SectionFrame>
  );
};
export default Panels;
