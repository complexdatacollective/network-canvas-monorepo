import { Folder, Upload } from 'lucide-react';
import type { DragEvent } from 'react';
import { useCallback, useState } from 'react';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { pickProtocolFile } from '~/lib/files/pickFile';
import type { ImportRequest } from '~/lib/protocol/useProtocolImport';

import { ExternalLink } from './ExternalLink';

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (request: ImportRequest) => void;
};

export function ImportDialog({ open, onClose, onSubmit }: ImportDialogProps) {
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const submitFile = useCallback(
    (file: File) => {
      onSubmit({ source: 'file', file, label: file.name });
      handleClose();
    },
    [handleClose, onSubmit],
  );

  const handleChooseFile = useCallback(async () => {
    const picked = await pickProtocolFile();
    if (!picked) return;
    submitFile(picked.file);
  }, [submitFile]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      submitFile(file);
    },
    [submitFile],
  );

  const dropZoneBorder = dragOver ? 'border-sea-green' : 'border-outline';
  const dropZoneBackground = dragOver
    ? 'bg-[color-mix(in_srgb,var(--color-sea-green)_10%,var(--surface))]'
    : 'bg-surface';

  return (
    <Dialog open={open} closeDialog={handleClose} title="Import a protocol">
      <Paragraph>
        Network Canvas protocol files end in{' '}
        <code className="bg-surface-2 font-monospace rounded px-2 py-0.5">
          .netcanvas
        </code>{' '}
        . Author a protocol file using{' '}
        <ExternalLink href="https://architect.networkcanvas.com">
          Architect
        </ExternalLink>
        , or the desktop version of Architect.
      </Paragraph>

      <button
        type="button"
        onClick={() => void handleChooseFile()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cx(
          'text-text block w-full cursor-pointer rounded-lg border-2 border-dashed px-8 py-11 text-center font-[inherit] transition-all duration-180',
          dropZoneBorder,
          dropZoneBackground,
        )}
      >
        <span
          aria-hidden
          className="bg-surface-2 text-sea-green mb-3.5 inline-flex h-[78px] w-[78px] items-center justify-center rounded-full"
        >
          <Upload size={32} aria-hidden />
        </span>
        <span className="mb-1.5 block text-xl font-extrabold">
          Drop a{' '}
          <code className="bg-surface-2 font-monospace rounded px-2 py-0.5">
            .netcanvas
          </code>{' '}
          file
        </span>
        <span className="inline-flex items-center gap-2 text-sm">
          <Folder size={16} strokeWidth={2.5} aria-hidden /> or use the file
          picker
        </span>
      </button>
    </Dialog>
  );
}
