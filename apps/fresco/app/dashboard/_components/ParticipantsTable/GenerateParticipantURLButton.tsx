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
import type { Protocol } from '~/lib/db/generated/client';

import type { ProtocolWithInterviews } from '../ProtocolsTable/ProtocolsTableClient';

const messages = defineMessages({
  copyCopyingURLToClipboard: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.copyCopyingURLToClipboard',
    defaultMessage: 'Copying URL to clipboard...',
    description:
      'Researcher-facing ParticipantsTable / GenerateParticipantURLButton: Copying URL to clipboard...',
  },
  copyURLCopiedToClipboard: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.copyURLCopiedToClipboard',
    defaultMessage: 'URL copied to clipboard!',
    description:
      'Researcher-facing ParticipantsTable / GenerateParticipantURLButton: URL copied to clipboard!',
  },
  failedToCopyURLToClipboard: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.failedToCopyURLToClipboard',
    defaultMessage: 'Failed to copy URL to clipboard.',
    description:
      'Researcher-facing ParticipantsTable / GenerateParticipantURLButton: Failed to copy URL to clipboard.',
  },
  copyUniqueURL: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.copyUniqueURL',
    defaultMessage: 'Copy Unique URL',
    description:
      'Researcher-facing ParticipantsTable / GenerateParticipantURLButton: Copy Unique URL',
  },
  selectAProtocolAndTheURLWill: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.selectAProtocolAndTheURLWill',
    defaultMessage:
      'Select a protocol, and the URL will be copied to your clipboard.',
    description:
      'Researcher-facing ParticipantsTable / GenerateParticipantURLButton: Select a protocol, and the URL will be copied to your clipboard.',
  },
  selectAProtocol: {
    id: 'fresco.ParticipantsTable.GenerateParticipantURLButton.selectAProtocol',
    defaultMessage: 'Select a Protocol...',
    description:
      'Researcher-facing ParticipantsTable / GenerateParticipantURLButton: Select a Protocol...',
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
      useState<Partial<Protocol> | null>();

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
              ) as Protocol;

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
