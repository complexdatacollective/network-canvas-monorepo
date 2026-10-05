import { DateTime } from 'luxon';
import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { APP_SCHEMA_VERSION } from '~/config';
import networkCanvasLogo from '~/images/NC-Mark.svg';

import ProtocolCard from './ProtocolCard';
import SummaryContext from './SummaryContext';
const messages = defineMessages({
  protocolSummaryDocument: {
    id: 'architect.protocolSummary.cover.protocolSummaryDocument',
    defaultMessage: 'Protocol Summary Document',
    description: 'Visible text in lib / ProtocolSummary / components / Cover.',
  },
  aNetworkCanvasProject: {
    id: 'architect.protocolSummary.cover.aNetworkCanvasProject',
    defaultMessage: 'A Network Canvas project',
    description: 'The alt text in lib / ProtocolSummary / components / Cover.',
  },
  documentCreated: {
    id: 'architect.protocolSummary.cover.documentCreated',
    defaultMessage: 'Document Created: {now}',
    description: 'Visible text in lib / ProtocolSummary / components / Cover.',
  },
});

const Cover = () => {
  const intl = useAppIntl();
  const { protocol, protocolName } = useContext(SummaryContext);

  const lastModifiedFormatted = protocol.lastModified
    ? DateTime.fromISO(protocol.lastModified).toHTTP()
    : DateTime.now().toHTTP();
  const date = new Date();
  const now = intl.formatDate(date, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });

  return (
    <div className="relative flex h-(--page-size-height) flex-col items-center justify-center print:h-screen">
      <div className="border-platinum absolute top-0 left-0 flex w-full items-center justify-between border-b-2">
        <Heading level="h2" margin="none">
          {intl.formatMessage(messages.protocolSummaryDocument)}
        </Heading>
        <div className="flex items-center justify-end">
          <img
            className="size-19"
            src={networkCanvasLogo}
            alt={intl.formatMessage(messages.aNetworkCanvasProject)}
          />
          <span className="font-heading text-xl leading-none font-bold">
            {/* Product name is an invariant brand. */}
            {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
            Network Canvas
          </span>
        </div>
      </div>
      <ProtocolCard
        name={protocolName}
        description={protocol.description ?? ''}
        lastModified={lastModifiedFormatted}
        schemaVersion={protocol.schemaVersion ?? APP_SCHEMA_VERSION}
      />
      <br />
      <br />
      <br />
      <Heading
        level="label"
        variant="all-caps"
        className="text-xs font-semibold"
      >
        {intl.formatMessage(messages.documentCreated, { now: now })}
      </Heading>
    </div>
  );
};

export default Cover;
