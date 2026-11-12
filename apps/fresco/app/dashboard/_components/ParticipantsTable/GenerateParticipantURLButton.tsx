'use client';

import { Copy } from 'lucide-react';
import { memo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { useToast } from '@codaco/fresco-ui/Toast';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type { ProtocolWithInterviews } from '../ProtocolsTable/ProtocolsTableClient';

const messages = defineMessages({
  copyCopyingURLToClipboard: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.copyCopyingURLToClipboard',
    defaultMessage: 'Copying URL to clipboard...',
    description:
      "Toast shown while the participant's unique interview link is being copied to the clipboard, after the researcher chose a protocol in the Participants table.",
  },
  copyURLCopiedToClipboard: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.copyURLCopiedToClipboard',
    defaultMessage: 'URL copied to clipboard!',
    description:
      "Success toast shown after a participant's unique interview link has been copied to the clipboard from the Participants table.",
  },
  failedToCopyURLToClipboard: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.failedToCopyURLToClipboard',
    defaultMessage: 'Failed to copy URL to clipboard.',
    description:
      "Error toast shown when copying a participant's unique interview link to the clipboard failed.",
  },
  copyUniqueURL: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.copyUniqueURL',
    defaultMessage: 'Copy Unique URL',
    description:
      "Button in each row of the Participants table, also the accessible name of the popover it opens; copies that participant's personal interview link to the clipboard (verb).",
  },
  selectAProtocolAndTheURLWill: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.selectAProtocolAndTheURLWill',
    defaultMessage:
      'Select a protocol, and the URL will be copied to your clipboard.',
    description:
      "Hint at the top of the popover opened by the Copy Unique URL button in the Participants table; explains that choosing a protocol copies the participant's link for it.",
  },
  selectAProtocol: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.selectAProtocol',
    defaultMessage: 'Select a Protocol...',
    description:
      'Placeholder and accessible name of the protocol dropdown in the Copy Unique URL popover of the Participants table. The researcher picks which protocol the link is for.',
  },
});

export const GenerateParticipationURLButton = memo(
  function GenerateParticipationURLButton({
    participant,
    protocols,
  }: {
    participant: { identifier: string };
    protocols: ProtocolWithInterviews[];
  }) {
    const intl = useAppIntl();

    const [open, setOpen] = useState(false);
    const [selectedProtocol, setSelectedProtocol] =
      useState<ProtocolWithInterviews | null>();

    const { promise } = useToast();

    const handleCopy = (url: string) => {
      if (url) {
        void promise(navigator.clipboard.writeText(url), {
          loading: {
            description: (
              <AppMessage message={messages.copyCopyingURLToClipboard} />
            ),
          },
          success: {
            description: (
              <AppMessage message={messages.copyURLCopiedToClipboard} />
            ),
          },
          error: {
            description: (
              <AppMessage message={messages.failedToCopyURLToClipboard} />
            ),
          },
        });
      }
    };

    return (
      <Popover open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
        <PopoverTrigger
          render={<Button size="sm" color="info" icon={<Copy />} />}
        >
          {intl.formatMessage(messages.copyUniqueURL)}
        </PopoverTrigger>
        <PopoverContent
          aria-label={intl.formatMessage(messages.copyUniqueURL)}
          className="flex flex-col gap-2"
        >
          <Paragraph intent="smallText">
            {intl.formatMessage(messages.selectAProtocolAndTheURLWill)}
          </Paragraph>
          <SelectField
            aria-label={intl.formatMessage(messages.selectAProtocol)}
            name="protocol"
            size="sm"
            options={protocols.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(value) => {
              const protocol = protocols.find(
                (candidate) => candidate.id === value,
              );

              setSelectedProtocol(protocol);
              handleCopy(
                `${window.location.origin}/onboard/${protocol?.id}/?participantIdentifier=${encodeURIComponent(
                  participant.identifier,
                )}`,
              );

              setSelectedProtocol(null);
            }}
            value={selectedProtocol?.id}
            placeholder={intl.formatMessage(messages.selectAProtocol)}
          />
        </PopoverContent>
      </Popover>
    );
  },
);
