import { createElement } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { ProtocolWithCounts } from '~/lib/db/types';

// The details dialog of a stored schema 8 protocol.

const messages = defineMessages({
  infoSchemaVersion: {
    id: 'interviewer.legacyProtocolDialogs.infoSchemaVersion',
    defaultMessage: 'Schema version',
    description:
      'Label in the details dialog of an older protocol, before its schema version number.',
  },
  infoImported: {
    id: 'interviewer.legacyProtocolDialogs.infoImported',
    defaultMessage: 'Imported',
    description:
      'Label in the details dialog of an older protocol, before how long ago it was imported.',
  },
  infoLastChanged: {
    id: 'interviewer.legacyProtocolDialogs.infoLastChanged',
    defaultMessage: 'Last changed',
    description:
      'Label in the details dialog of an older protocol, before how long ago the protocol itself was last changed by its author.',
  },
  infoInterviews: {
    id: 'interviewer.legacyProtocolDialogs.infoInterviews',
    defaultMessage: 'Interviews',
    description:
      'Label in the details dialog of an older protocol, before the number of interviews collected with it.',
  },
});

type OpenDialog = DialogContextType['openDialog'];

/** A schema 8 protocol's details. */
export function LegacyProtocolInfo({
  protocol,
}: {
  protocol: ProtocolWithCounts;
}) {
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

export async function showLegacyProtocolInfo(
  openDialog: OpenDialog,
  protocol: ProtocolWithCounts,
) {
  await openDialog({
    type: 'acknowledge',
    intent: 'info',
    title: protocol.name,
    children: <LegacyProtocolInfo protocol={protocol} />,
    actions: {
      primary: {
        label: createElement(AppMessage, { message: commonMessages.close }),
        value: true,
      },
    },
  });
}
