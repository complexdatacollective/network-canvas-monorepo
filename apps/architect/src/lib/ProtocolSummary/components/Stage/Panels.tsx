import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
// TODO: add filter
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import AssetBadge from '../AssetBadge';
import MiniTable from '../MiniTable';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  panels: {
    id: 'architect.protocolSummary.stage.panels.panels',
    defaultMessage: 'Panels',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / Panels.',
  },
  existingNetwork: {
    id: 'architect.protocolSummary.stage.panels.existingNetwork',
    defaultMessage: 'Existing network',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / Panels.',
  },
});

type PanelsProps = {
  panels?: Array<{
    id: string;
    title: string;
    dataSource: string;
  }> | null;
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
          <li className="my-5 pl-5" key={panel.id}>
            <MiniTable
              rotated
              rows={[
                [intl.formatMessage(summaryMessages.title), panel.title],
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
