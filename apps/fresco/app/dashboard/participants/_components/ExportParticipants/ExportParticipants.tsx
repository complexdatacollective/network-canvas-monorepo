'use client';

import { unparse } from 'papaparse';
import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { useToast } from '@codaco/fresco-ui/Toast';
import type { ParticipantExportRow } from '~/actions/participants';
import type { ProtocolWithInterviews } from '~/app/dashboard/_components/ProtocolsTable/ProtocolsTableClient';
import { useDownload } from '~/hooks/useDownload';

const messages = defineMessages({
  success: {
    id: 'fresco.participants.ExportParticipants.ExportParticipants.success',
    defaultMessage: 'Success',
    description:
      'Researcher-facing participants / ExportParticipants / ExportParticipants: Success',
  },
  participantsExportedSuccessfully: {
    id: 'fresco.participants.ExportParticipants.ExportParticipants.participantsExportedSuccessfully',
    defaultMessage: 'Participants exported successfully',
    description:
      'Researcher-facing participants / ExportParticipants / ExportParticipants: Participants exported successfully',
  },
  error: {
    id: 'fresco.participants.ExportParticipants.ExportParticipants.error',
    defaultMessage: 'Error',
    description:
      'Researcher-facing participants / ExportParticipants / ExportParticipants: Error',
  },
  anErrorOccurredWhileExportingParticipants: {
    id: 'fresco.participants.ExportParticipants.ExportParticipants.anErrorOccurredWhileExportingParticipants',
    defaultMessage: 'An error occurred while exporting participants',
    description:
      'Researcher-facing participants / ExportParticipants / ExportParticipants: An error occurred while exporting participants',
  },
});

export function useExportParticipants(protocols: ProtocolWithInterviews[]) {
  const download = useDownload();
  const { add } = useToast();

  return useCallback(
    (participants: ParticipantExportRow[]) => {
      try {
        const csvData = participants.map((participant) => {
          const row: Record<string, string> = {
            id: participant.id,
            identifier: participant.identifier,
            label: participant.label ?? '',
          };

          for (const protocol of protocols) {
            const name = protocol.name.split('.')[0] ?? protocol.id;
            // The onboard route only reads `participantIdentifier`; this must
            // match the URL built by GenerateParticipantURLButton.
            row[`interview_url_${name}`] =
              `${window.location.origin}/onboard/${protocol.id}/?participantIdentifier=${encodeURIComponent(
                participant.identifier,
              )}`;
          }

          return row;
        });

        const csv = unparse(csvData, { header: true });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        download(url, 'participants.csv');
        URL.revokeObjectURL(url);

        add({
          title: <AppMessage message={messages.success} />,
          description: (
            <AppMessage message={messages.participantsExportedSuccessfully} />
          ),
          variant: 'success',
        });
      } catch (error) {
        add({
          title: <AppMessage message={messages.error} />,
          description: (
            <AppMessage
              message={messages.anErrorOccurredWhileExportingParticipants}
            />
          ),
          variant: 'destructive',
        });
      }
    },
    [protocols, download, add],
  );
}
