import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { Item } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import Asset from '../Asset';
import MiniTable from '../MiniTable';
import { SummaryMarkdown } from '../SummaryText';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  items: {
    id: 'architect.protocolSummary.stage.items.items',
    defaultMessage: 'Items',
    description:
      'Section heading in the printable protocol summary, above the list of text and media items on an Information stage.',
  },
});

type ItemsProps = {
  items?: Item[] | null;
};

const Items = ({ items = null }: ItemsProps) => {
  const intl = useAppIntl();
  if (!items) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.items)}>
      {items.map((item) =>
        item.type === 'asset' ? (
          <div key={item.id}>
            <Asset id={item.content} size={item.size ?? ''} />
          </div>
        ) : (
          <div key={item.id}>
            <MiniTable
              rotated
              rows={[
                [
                  intl.formatMessage(summaryMessages.type),
                  intl.formatMessage(summaryMessages.text),
                ],
                [
                  intl.formatMessage(summaryMessages.content),
                  <SummaryMarkdown key="content" value={item.content} />,
                ],
              ]}
            />
          </div>
        ),
      )}
    </SectionFrame>
  );
};

export default Items;
