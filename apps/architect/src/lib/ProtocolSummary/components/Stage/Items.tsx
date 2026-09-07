import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Markdown from '~/components/Markdown';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import Asset from '../Asset';
import MiniTable from '../MiniTable';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  items: {
    id: 'architect.protocolSummary.stage.items.items',
    defaultMessage: 'Items',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / Items.',
  },
});

type ItemsProps = {
  items?: Array<{
    id?: string;
    type?: string;
    content?: string;
    size?: string;
  }> | null;
};

const Items = ({ items = null }: ItemsProps) => {
  const intl = useAppIntl();
  if (!items) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.items)}>
      {items.map(({ type, content, size, id }) => {
        switch (type) {
          case 'asset':
            return (
              <div key={id}>
                <Asset id={content ?? ''} size={size ?? ''} />
              </div>
            );
          default:
            return (
              <div key={id}>
                <MiniTable
                  rotated
                  rows={[
                    ...(type === 'text'
                      ? []
                      : [
                          [intl.formatMessage(summaryMessages.blockSize), size],
                        ]),
                    [
                      intl.formatMessage(summaryMessages.type),
                      intl.formatMessage(summaryMessages.text),
                    ],
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    [
                      intl.formatMessage(summaryMessages.content),
                      <Markdown key="content" label={content ?? ''} />,
                    ],
                  ]}
                />
              </div>
            );
        }
      })}
    </SectionFrame>
  );
};

export default Items;
