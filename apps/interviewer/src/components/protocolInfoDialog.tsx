import { createElement } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { ProtocolWithCounts } from '~/lib/db/types';

// The details dialog of a stored protocol, whatever its schema.

const messages = defineMessages({
  infoSchemaVersion: {
    id: 'interviewer.protocolInfoDialog.infoSchemaVersion',
    defaultMessage: 'Schema version',
    description:
      'Label in a protocol’s details dialog, before its schema version number.',
  },
  infoImported: {
    id: 'interviewer.protocolInfoDialog.infoImported',
    defaultMessage: 'Imported',
    description:
      'Label in a protocol’s details dialog, before how long ago it was imported.',
  },
  infoLastChanged: {
    id: 'interviewer.protocolInfoDialog.infoLastChanged',
    defaultMessage: 'Last changed',
    description:
      'Label in a protocol’s details dialog, before how long ago the protocol itself was last changed by its author.',
  },
  infoInterviews: {
    id: 'interviewer.protocolInfoDialog.infoInterviews',
    defaultMessage: 'Interviews',
    description:
      'Label in a protocol’s details dialog, before the number of interviews collected with it.',
  },
});

type OpenDialog = DialogContextType['openDialog'];

/** A stored protocol's details. */
export function ProtocolInfo({ protocol }: { protocol: ProtocolWithCounts }) {
  const intl = useAppIntl();
  const rows = [
    {
      label: messages.infoSchemaVersion,
      value: intl.formatNumber(protocol.schemaVersion),
    },
    {
      label: messages.infoImported,
      value: <TimeAgo date={protocol.importedAt} />,
    },
    ...(protocol.lastModified
      ? [
          {
            label: messages.infoLastChanged,
            value: <TimeAgo date={protocol.lastModified} />,
          },
        ]
      : []),
    {
      label: messages.infoInterviews,
      value: intl.formatNumber(protocol.sessionCount),
    },
  ];
  return (
    <>
      {protocol.description ? (
        <Paragraph>{protocol.description}</Paragraph>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        {rows.map((row) => (
          <div key={row.label.id} className="contents">
            <dt className="font-semibold">{intl.formatMessage(row.label)}</dt>
            <dd className="m-0">{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export async function showProtocolInfo(
  openDialog: OpenDialog,
  protocol: ProtocolWithCounts,
) {
  await openDialog({
    type: 'acknowledge',
    intent: 'info',
    title: protocol.name,
    children: <ProtocolInfo protocol={protocol} />,
    actions: {
      primary: {
        label: createElement(AppMessage, { message: commonMessages.close }),
        value: true,
      },
    },
  });
}
