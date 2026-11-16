'use client';

import { FileDown, Upload } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
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
      'Heading of the participant import drop area on the Participants page, shown while a file is being dragged over it. Prompts the researcher to release the file.',
  },
  copyImportParticipants: {
    id: 'fresco.participants.ImportParticipants.copyImportParticipants',
    defaultMessage: 'Import participants',
    description:
      'Heading of the participant import drop area on the Participants page when no file is being dragged. Import is an action: adding participants from a file.',
  },
  error: {
    id: 'fresco.participants.ImportParticipants.error',
    defaultMessage: 'Error',
    description:
      'Title of the error toast on the Participants page when importing participants from a file fails; the toast body gives the reason.',
  },
  fileMustBeAValidCSVWith: {
    id: 'fresco.participants.ImportParticipants.fileMustBeAValidCSVWith',
    defaultMessage: 'File must be a valid CSV with label or identifier columns',
    description:
      'Body of the error toast when the file chosen for participant import is not a usable CSV (spreadsheet) file. It needs a column named label or identifier; those are column names.',
  },
  importCompletedWithCollisions: {
    id: 'fresco.participants.ImportParticipants.importCompletedWithCollisions',
    defaultMessage: 'Import completed with collisions',
    description:
      'Title of a warning toast after a participant import in which some rows were skipped because their identifiers already belong to existing participants. Collision means a duplicate identifier.',
  },
  yourParticipantsWereImportedSuccessfullyButSome: {
    id: 'fresco.participants.ImportParticipants.yourParticipantsWereImportedSuccessfullyButSome',
    defaultMessage:
      'Your participants were imported successfully, but some identifiers collided with existing participants and were not imported.',
    description:
      'Body of the warning toast after a participant import where some identifiers matched existing participants and those rows were not imported. A list of the clashing identifiers may follow.',
  },
  participantsImported: {
    id: 'fresco.participants.ImportParticipants.participantsImported',
    defaultMessage: 'Participants imported',
    description:
      'Title of the success toast on the Participants page after participants were imported from a file. Imported is a completed action.',
  },
  participantsHaveBeenImportedSuccessfully: {
    id: 'fresco.participants.ImportParticipants.participantsHaveBeenImportedSuccessfully',
    defaultMessage: 'Participants have been imported successfully',
    description:
      'Body of the success toast on the Participants page after every participant in the chosen file was imported.',
  },
  anErrorOccurredWhileImportingParticipants: {
    id: 'fresco.participants.ImportParticipants.anErrorOccurredWhileImportingParticipants',
    defaultMessage: 'An error occurred while importing participants',
    description:
      'Body of the error toast on the Participants page when reading or importing the chosen participant file failed unexpectedly.',
  },
  importParticipants: {
    id: 'fresco.participants.ImportParticipants.importParticipants',
    defaultMessage: 'Import Participants',
    description:
      "Button on the Participants page that opens the participant import panel; also the panel's accessible name read by screen readers. Import is an action: adding participants from a CSV file.",
  },
  dragDropACsvFileHere: {
    id: 'fresco.participants.ImportParticipants.dragDropACsvFileHere',
    defaultMessage: 'Drag & drop a <tag1>.csv</tag1> file here',
    description:
      'Instruction line in the participant import drop area. tag1 wraps the file extension .csv, shown in code style; keep the extension untranslated.',
  },
  browseFiles: {
    id: 'fresco.participants.ImportParticipants.browseFiles',
    defaultMessage: 'Browse files',
    description:
      "Button in the participant import drop area that opens the computer's file picker, as an alternative to dragging a file.",
  },
});

const renderCodeChunks = (chunks: ReactNode[]) => <code>{chunks}</code>;

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
            <Paragraph
              intent="smallText"
              margin="none"
              emphasis="muted"
              className="mt-1"
            >
              {intl.formatMessage(messages.dragDropACsvFileHere, {
                tag1: renderCodeChunks,
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
