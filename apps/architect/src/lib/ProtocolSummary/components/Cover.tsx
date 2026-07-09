import { DateTime } from 'luxon';
import { useContext } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import networkCanvasLogo from '~/images/NC-Mark.svg';

import ProtocolCard from './ProtocolCard';
import SummaryContext from './SummaryContext';

const Cover = () => {
  const { protocol, protocolName } = useContext(SummaryContext);

  const lastModifiedFormatted = protocol.lastModified
    ? DateTime.fromISO(protocol.lastModified).toHTTP()
    : DateTime.now().toHTTP();
  const date = new Date();
  const now = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

  return (
    <div className="relative flex h-(--page-size-height) flex-col items-center justify-center print:h-screen">
      <div className="border-platinum absolute top-0 left-0 flex w-full items-center justify-between border-b-2">
        <Heading level="h2">Protocol Summary Document</Heading>
        <div className="flex items-center justify-end">
          <img
            className="size-19"
            src={networkCanvasLogo}
            alt="A Network Canvas project"
          />
          <Heading level="h2">Network Canvas</Heading>
        </div>
      </div>
      <ProtocolCard
        name={protocolName}
        description={protocol.description ?? ''}
        lastModified={lastModifiedFormatted}
        schemaVersion={protocol.schemaVersion ?? 8}
      />
      <br />
      <br />
      <br />
      <Heading
        level="label"
        variant="all-caps"
        className="text-xs font-semibold"
      >
        Document Created: {now}
      </Heading>
    </div>
  );
};

export default Cover;
