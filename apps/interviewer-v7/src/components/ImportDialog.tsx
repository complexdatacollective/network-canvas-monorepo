import { CloudDownload, Folder, Upload } from 'lucide-react';
import type { DragEvent } from 'react';
import { useCallback, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { HomeModal } from '~/components/HomeModal';
import { pickProtocolFile } from '~/lib/files/pickFile';
import { deriveNameFromUrl } from '~/lib/protocol/importProtocol';

export type ImportRequest =
  | { source: 'file'; file: File; label: string }
  | { source: 'url'; url: string; label: string };

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (request: ImportRequest) => void;
};

function isProbablyValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const codeChipClass = 'rounded-md bg-surface-2 px-2 py-0.5';

export function ImportDialog({ open, onClose, onSubmit }: ImportDialogProps) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setUrl('');
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

  const handleFetchUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!isProbablyValidUrl(trimmed)) {
      toast.add({
        title: 'Invalid URL',
        description:
          'URL must start with https:// (or http:// for local servers).',
        variant: 'destructive',
      });
      return;
    }
    onSubmit({
      source: 'url',
      url: trimmed,
      label: deriveNameFromUrl(trimmed),
    });
    handleClose();
  }, [handleClose, onSubmit, toast, url]);

  const dropZoneBorder = dragOver ? 'border-sea-green' : 'border-outline';
  const dropZoneBackground = dragOver
    ? 'bg-[color-mix(in_srgb,var(--color-sea-green)_10%,var(--surface))]'
    : 'bg-surface';

  return (
    <HomeModal open={open} onClose={handleClose} title="Import a protocol">
      <Paragraph>
        Protocol files end in{' '}
        <code className={`mono ${codeChipClass}`}>.netcanvas</code> and
        configure every stage of the interview.
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
        className={`text-text mb-[22px] block w-full cursor-pointer rounded-lg border-2 border-dashed px-8 py-11 text-center font-[inherit] transition-all duration-180 ${dropZoneBorder} ${dropZoneBackground}`}
      >
        <span
          aria-hidden
          className="bg-surface-2 text-sea-green mb-3.5 inline-flex h-[78px] w-[78px] items-center justify-center rounded-full"
        >
          <Upload size={32} aria-hidden />
        </span>
        <span className="mb-1.5 block text-xl font-extrabold">
          Drop a <code className={codeChipClass}>.netcanvas</code> file
        </span>
        <span className="inline-flex items-center gap-2 text-sm">
          <Folder size={16} strokeWidth={2.5} aria-hidden /> or use the file
          picker
        </span>
      </button>

      <div className="mx-1 my-5 flex items-center gap-3.5">
        <span aria-hidden className="bg-outline h-px flex-1" />
        <span className="uppercase">or</span>
        <span aria-hidden className="bg-outline h-px flex-1" />
      </div>

      <Surface as="section" level={1} spacing="md" noContainer>
        <Heading level="h4">Import from URL</Heading>
        <Paragraph intent="smallText">
          Paste a link to a hosted protocol file.
        </Paragraph>
        <div className="flex gap-2.5">
          <InputField
            type="url"
            value={url}
            onChange={(value) => setUrl(value ?? '')}
            placeholder="https://..."
            aria-label="Protocol URL"
            className="flex-1"
          />
          <Button
            color="primary"
            icon={<CloudDownload size={16} strokeWidth={2.5} aria-hidden />}
            onClick={handleFetchUrl}
            disabled={url.trim().length === 0}
          >
            Fetch
          </Button>
        </div>
      </Surface>
    </HomeModal>
  );
}
