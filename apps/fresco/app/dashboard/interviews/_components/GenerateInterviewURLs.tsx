'use client';

import { FileUp } from 'lucide-react';
import { use, useState, useTransition } from 'react';
import superjson from 'superjson';

import { defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { Skeleton } from '@codaco/fresco-ui/Skeleton';
import { useToast } from '@codaco/fresco-ui/Toast';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  getIncompleteInterviewUrlData,
  type IncompleteInterviewUrlData,
} from '~/actions/interviews';
import type {
  GetProtocolsQuery,
  GetProtocolsReturnType,
} from '~/queries/protocols';

import ExportCSVInterviewURLs from './ExportCSVInterviewURLs';

const messages = defineMessages({
  error: {
    id: 'fresco.interviews.GenerateInterviewURLs.error',
    defaultMessage: 'Error',
    description: 'Researcher-facing interviews / GenerateInterviewURLs: Error',
  },
  exportIncompleteInterviewURLs: {
    id: 'fresco.interviews.GenerateInterviewURLs.exportIncompleteInterviewURLs',
    defaultMessage: 'Export Incomplete Interview URLs',
    description:
      'Researcher-facing interviews / GenerateInterviewURLs: Export Incomplete Interview URLs',
  },
  generateACSVThatContainsUniqueInterview: {
    id: 'fresco.interviews.GenerateInterviewURLs.generateACSVThatContainsUniqueInterview',
    defaultMessage:
      'Generate a CSV that contains unique interview URLs for all incomplete interviews by protocol.',
    description:
      'Researcher-facing interviews / GenerateInterviewURLs: Generate a CSV that contains unique interview URLs for all incomplete interviews by protocol.',
  },
  selectAProtocol: {
    id: 'fresco.interviews.GenerateInterviewURLs.selectAProtocol',
    defaultMessage: 'Select a Protocol...',
    description:
      'Researcher-facing interviews / GenerateInterviewURLs: Select a Protocol...',
  },
});

export const GenerateInterviewURLs = ({
  protocolsPromise,
  className,
}: {
  protocolsPromise: GetProtocolsReturnType;
  className?: string;
}) => {
  const intl = useAppIntl();

  const rawProtocols = use(protocolsPromise);
  const protocols = superjson.parse<GetProtocolsQuery>(rawProtocols);
  const { add } = useToast();

  const [interviewsToExport, setInterviewsToExport] = useState<
    IncompleteInterviewUrlData[]
  >([]);

  const [selectedProtocol, setSelectedProtocol] =
    useState<(typeof protocols)[number]>();

  const [isLoading, startLoading] = useTransition();

  const handleSelectProtocol = (protocolId: string | number) => {
    const protocol = protocols.find((p) => p.id === protocolId);
    setSelectedProtocol(protocol);
    setInterviewsToExport([]);

    if (!protocol) return;

    startLoading(async () => {
      const result = await getIncompleteInterviewUrlData(protocol.id);
      if (result.error) {
        add({
          title: <AppMessage message={messages.error} />,
          description: <AppErrorMessage error={result.error} />,
          variant: 'destructive',
        });
        return;
      }
      setInterviewsToExport(result.data);
    });
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            icon={<FileUp />}
            className={className}
            data-testid="export-incomplete-urls-button"
          />
        }
      >
        {intl.formatMessage(messages.exportIncompleteInterviewURLs)}
      </PopoverTrigger>
      <PopoverContent
        aria-label={intl.formatMessage(messages.exportIncompleteInterviewURLs)}
        className="flex max-w-sm flex-col gap-4"
      >
        <Paragraph>
          {intl.formatMessage(messages.generateACSVThatContainsUniqueInterview)}
        </Paragraph>

        {!protocols ? (
          <Skeleton className="h-10 w-full rounded" />
        ) : (
          <SelectField
            aria-label={intl.formatMessage(messages.selectAProtocol)}
            name="Protocol"
            size="sm"
            options={protocols.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(value) => {
              if (value) handleSelectProtocol(value);
            }}
            value={selectedProtocol?.id}
            placeholder={intl.formatMessage(messages.selectAProtocol)}
          />
        )}
        <div className="flex justify-end">
          <ExportCSVInterviewURLs
            protocol={selectedProtocol}
            interviews={interviewsToExport}
            disabled={isLoading}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
