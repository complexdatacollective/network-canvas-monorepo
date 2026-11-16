'use client';

import { Upload } from 'lucide-react';
import { type ReactNode, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { PROTOCOL_EXTENSION } from '~/fresco.config';

const messages = defineMessages({
  copyDropFilesHere: {
    id: 'fresco.ProtocolImport.ProtocolImportDropzone.copyDropFilesHere',
    defaultMessage: 'Drop files here',
    description:
      'Heading of the protocol upload area while the researcher is dragging a file over it, telling them to release it to upload.',
  },
  copyImportProtocols: {
    id: 'fresco.ProtocolImport.ProtocolImportDropzone.copyImportProtocols',
    defaultMessage: 'Import protocols',
    description:
      'Heading of the protocol upload area on the Protocols page when nothing is being dragged. Import is a verb: it uploads protocol files into this installation.',
  },
  dragDropFilesHere: {
    id: 'fresco.ProtocolImport.ProtocolImportDropzone.dragDropFilesHere',
    defaultMessage: 'Drag & drop <tag1>{value1}</tag1> files here',
    description:
      'Hint under the heading of the protocol upload area. value1 is the protocol file extension, shown in code style and not translated; tag1 wraps it.',
  },
  browseFiles: {
    id: 'fresco.ProtocolImport.ProtocolImportDropzone.browseFiles',
    defaultMessage: 'Browse files',
    description:
      "Button in the protocol upload area that opens the computer's file picker so the researcher can choose protocol files instead of dragging them.",
  },
});

const renderCodeChunks = (chunks: ReactNode[]) => <code>{chunks}</code>;

type ProtocolImportDropzoneProps = {
  onFilesAccepted: (files: File[]) => void;
  className?: string;
};

export default function ProtocolImportDropzone({
  onFilesAccepted,
  className,
}: ProtocolImportDropzoneProps) {
  const intl = useAppIntl();

  const handleDrop = useCallback(
    (files: File[]) => {
      onFilesAccepted(files);
    },
    [onFilesAccepted],
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFileDialog,
  } = useDropzone({
    onDropAccepted: handleDrop,
    accept: {
      'application/octect-stream': [PROTOCOL_EXTENSION],
      'application/zip': [PROTOCOL_EXTENSION],
    },
    noClick: true,
  });

  return (
    <div
      {...getRootProps()}
      className={cx(
        'flex flex-col items-center gap-3 p-6 text-center',
        'rounded-sm border-2 border-dashed transition-colors',
        isDragActive ?? 'border-sea-green',
        className,
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
            ? intl.formatMessage(messages.copyDropFilesHere)
            : intl.formatMessage(messages.copyImportProtocols)}
        </Heading>
        <Paragraph
          intent="smallText"
          margin="none"
          emphasis="muted"
          className="mt-1"
        >
          {intl.formatMessage(messages.dragDropFilesHere, {
            value1: PROTOCOL_EXTENSION,
            tag1: renderCodeChunks,
          })}
        </Paragraph>
      </div>
      <Button size="sm" onClick={openFileDialog}>
        {intl.formatMessage(messages.browseFiles)}
      </Button>
    </div>
  );
}
