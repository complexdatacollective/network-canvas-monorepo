'use client';

import { FileDown, Upload } from 'lucide-react';
import { useCallback, useState } from 'react';
import { type FileRejection, useDropzone } from 'react-dropzone';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  AppErrorMessage,
  AppMessage,
  useAppIntl,
} from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { importParticipants } from '~/actions/participants';
import { createParticipantSchemas } from '~/schemas/participant';
import parseCSV from '~/utils/parseCSV';

import selectParticipantImportFile from './selectParticipantImportFile';

const messages = defineMessages({
  copyDropFileHere: {
    id: 'fresco.participants.ImportParticipants.copyDropFileHere',
    defaultMessage: 'Drop file here',
    description:
      'Researcher-facing participants / ImportParticipants: Drop file here',
  },
  copyImportParticipants: {
    id: 'fresco.participants.ImportParticipants.copyImportParticipants',
    defaultMessage: 'Import participants',
    description:
      'Researcher-facing participants / ImportParticipants: Import participants',
  },
  error: {
    id: 'fresco.participants.ImportParticipants.error',
    defaultMessage: 'Error',
    description: 'Researcher-facing participants / ImportParticipants: Error',
  },
  fileMustBeAValidCSVWith: {
    id: 'fresco.participants.ImportParticipants.fileMustBeAValidCSVWith',
    defaultMessage: 'File must be a valid CSV with label or identifier columns',
    description:
      'Researcher-facing participants / ImportParticipants: File must be a valid CSV with label or identifier columns',
  },
  importCompletedWithCollisions: {
    id: 'fresco.participants.ImportParticipants.importCompletedWithCollisions',
    defaultMessage: 'Import completed with collisions',
    description:
      'Researcher-facing participants / ImportParticipants: Import completed with collisions',
  },
  yourParticipantsWereImportedSuccessfullyButSome: {
    id: 'fresco.participants.ImportParticipants.yourParticipantsWereImportedSuccessfullyButSome',
    defaultMessage:
      'Your participants were imported successfully, but some identifiers collided with existing participants and were not imported.',
    description:
      'Researcher-facing participants / ImportParticipants: Your participants were imported successfully, but some identifiers collided with existing participants and were not impo',
  },
  participantsImported: {
    id: 'fresco.participants.ImportParticipants.participantsImported',
    defaultMessage: 'Participants imported',
    description:
      'Researcher-facing participants / ImportParticipants: Participants imported',
  },
  participantsHaveBeenImportedSuccessfully: {
    id: 'fresco.participants.ImportParticipants.participantsHaveBeenImportedSuccessfully',
    defaultMessage: 'Participants have been imported successfully',
    description:
      'Researcher-facing participants / ImportParticipants: Participants have been imported successfully',
  },
  anErrorOccurredWhileImportingParticipants: {
    id: 'fresco.participants.ImportParticipants.anErrorOccurredWhileImportingParticipants',
    defaultMessage: 'An error occurred while importing participants',
    description:
      'Researcher-facing participants / ImportParticipants: An error occurred while importing participants',
  },
  importParticipants: {
    id: 'fresco.participants.ImportParticipants.importParticipants',
    defaultMessage: 'Import Participants',
    description:
      'Researcher-facing participants / ImportParticipants: Import Participants',
  },
  dragDropACsvFileHere: {
    id: 'fresco.participants.ImportParticipants.dragDropACsvFileHere',
    defaultMessage: 'Drag & drop a <tag1>.csv</tag1> file here',
    description:
      'Researcher-facing participants / ImportParticipants: Drag & drop a .csv file here',
  },
  browseFiles: {
    id: 'fresco.participants.ImportParticipants.browseFiles',
    defaultMessage: 'Browse files',
    description:
      'Researcher-facing participants / ImportParticipants: Browse files',
  },
});

export default function ImportParticipants() {
  const intl = useAppIntl();
  const { csvDataSchema } = createParticipantSchemas(createMessageError);

  const [open, setOpen] = useState(false);
  const { add } = useToast();

  const handleFileAccepted = useCallback(
    async (file: File) => {
      try {
        const csvData = await parseCSV(file);
        const parsed = csvDataSchema.safeParse(csvData);

        if (!parsed.success) {
          add({
            title: <AppMessage message={messages.error} />,
            description: (
              <AppMessage message={messages.fileMustBeAValidCSVWith} />
            ),
            variant: 'destructive',
          });
          return;
        }

        const result = await importParticipants(parsed.data);

        if (result.error) {
          add({
            title: <AppMessage message={messages.error} />,
            description: <AppErrorMessage error={result.error} />,
            variant: 'destructive',
          });
          return;
        }

        if (
          result.existingParticipants &&
          result.existingParticipants.length > 0
        ) {
          add({
            title: (
              <AppMessage message={messages.importCompletedWithCollisions} />
            ),
            description: (
              <>
                <p>
                  {
                    <AppMessage
                      message={
                        messages.yourParticipantsWereImportedSuccessfullyButSome
                      }
                    />
                  }
                </p>
                {result.existingParticipants.length < 5 && (
                  <ul>
                    {result.existingParticipants.map((item) => (
                      <li key={item.identifier}>{item.identifier}</li>
                    ))}
                  </ul>
                )}
              </>
            ),
            variant: 'destructive',
          });
        } else {
          add({
            title: <AppMessage message={messages.participantsImported} />,
            description: (
              <AppMessage
                message={messages.participantsHaveBeenImportedSuccessfully}
              />
            ),
            variant: 'success',
          });
        }

        setOpen(false);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(e);
        add({
          title: <AppMessage message={messages.error} />,
          description: (
            <AppMessage
              message={messages.anErrorOccurredWhileImportingParticipants}
            />
          ),
          variant: 'destructive',
        });
      }
    },
    [csvDataSchema, add],
  );

  const handleDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      const file = selectParticipantImportFile(acceptedFiles, rejectedFiles);

      if (!file) return;

      void handleFileAccepted(file);
    },
    [handleFileAccepted],
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFileDialog,
  } = useDropzone({
    onDrop: handleDrop,
    accept: {
      'text/csv': [],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
      'application/vnd.ms-excel': [],
    },
    noClick: true,
    multiple: false,
    maxFiles: 1,
    maxSize: 1024 * 5000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button icon={<FileDown />} />}>
        {intl.formatMessage(messages.importParticipants)}
      </PopoverTrigger>
      <PopoverContent
        aria-label={intl.formatMessage(messages.importParticipants)}
        align="end"
        className="w-full max-w-md"
      >
        <div
          {...getRootProps()}
          className={cx(
            'flex flex-col items-center gap-3 p-6 text-center',
            'rounded-sm border-2 border-dashed transition-colors',
            isDragActive && 'border-sea-green',
          )}
        >
          <input {...getInputProps()} />
          <div
            className={cx(
              'flex size-12 items-center justify-center rounded-full',
              isDragActive ? 'bg-sea-green' : 'bg-current/5',
            )}
          >
            <Upload
              className={cx(
                'size-6',
                isDragActive ? 'text-sea-green' : 'text-current',
              )}
            />
          </div>
          <div>
            <Heading level="h4" margin="none">
              {isDragActive
                ? intl.formatMessage(messages.copyDropFileHere)
                : intl.formatMessage(messages.copyImportParticipants)}
            </Heading>
            <Paragraph margin="none" emphasis="muted" className="mt-1 text-sm">
              {intl.formatMessage(messages.dragDropACsvFileHere, {
                tag1: (chunks) => <code>{chunks}</code>,
              })}
            </Paragraph>
          </div>
          <Button size="sm" onClick={openFileDialog}>
            {intl.formatMessage(messages.browseFiles)}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
