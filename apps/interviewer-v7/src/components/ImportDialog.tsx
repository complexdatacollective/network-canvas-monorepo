import { Check, CloudDownload, Folder, Upload } from 'lucide-react';
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
import {
  importProtocolFromFile,
  importProtocolFromUrl,
} from '~/lib/protocol/importProtocol';

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImported?: (hash: string) => void;
};

type DialogMode = 'source' | 'uploading' | 'done';

type ImportedDetails = {
  hash: string;
  name: string;
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

export function ImportDialog({ open, onClose, onImported }: ImportDialogProps) {
  const toast = useToast();
  const [mode, setMode] = useState<DialogMode>('source');
  const [url, setUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [imported, setImported] = useState<ImportedDetails | null>(null);

  const reset = useCallback(() => {
    setMode('source');
    setUrl('');
    setDragOver(false);
    setImported(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const runFileImport = useCallback(
    async (file: File) => {
      setMode('uploading');
      const result = await importProtocolFromFile(file);
      if (result.success) {
        setImported({ hash: result.hash, name: result.protocol.name });
        setMode('done');
        toast.add({
          title: 'Protocol imported',
          description: result.migrated
            ? `${result.protocol.name} was migrated to the current schema.`
            : `${result.protocol.name} is ready to use.`,
          variant: 'success',
        });
      } else {
        setMode('source');
        toast.add({
          title: 'Import failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    },
    [toast],
  );

  const handleChooseFile = useCallback(async () => {
    const picked = await pickProtocolFile();
    if (!picked) return;
    await runFileImport(picked.file);
  }, [runFileImport]);

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      await runFileImport(file);
    },
    [runFileImport],
  );

  const handleFetchUrl = useCallback(async () => {
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
    setMode('uploading');
    const result = await importProtocolFromUrl(trimmed);
    if (result.success) {
      setImported({ hash: result.hash, name: result.protocol.name });
      setMode('done');
      toast.add({
        title: 'Protocol imported',
        description: result.migrated
          ? `${result.protocol.name} was migrated to the current schema.`
          : `${result.protocol.name} is ready to use.`,
        variant: 'success',
      });
    } else {
      setMode('source');
      toast.add({
        title: 'Import failed',
        description: result.message,
        variant: 'destructive',
      });
    }
  }, [toast, url]);

  const handleStartInterview = useCallback(() => {
    if (imported) onImported?.(imported.hash);
    handleClose();
  }, [handleClose, imported, onImported]);

  const dropZoneBorder = dragOver ? 'border-sea-green' : 'border-outline';
  const dropZoneBackground = dragOver
    ? 'bg-[color-mix(in_srgb,var(--color-sea-green)_10%,var(--surface))]'
    : 'bg-surface';

  return (
    <HomeModal open={open} onClose={handleClose} title="Import a protocol">
      {mode === 'source' && (
        <>
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
            onDrop={(event) => void handleDrop(event)}
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
                onClick={() => void handleFetchUrl()}
                disabled={url.trim().length === 0}
              >
                Fetch
              </Button>
            </div>
          </Surface>
        </>
      )}

      {mode === 'uploading' && (
        <div className="px-0 pt-8 pb-3 text-center">
          <div className="bg-surface-2 text-sea-green mx-auto mb-[18px] inline-flex h-[78px] w-[78px] items-center justify-center rounded-full">
            <Upload size={32} aria-hidden />
          </div>
          <Heading level="h3" margin="none" className="mb-2">
            Importing…
          </Heading>
          <Paragraph intent="smallText" emphasis="muted" margin="none">
            Verifying schema · expanding assets · indexing stages…
          </Paragraph>
        </div>
      )}

      {mode === 'done' && imported && (
        <div className="px-0 pt-6 pb-3 text-center">
          <div className="bg-sea-green/20 text-sea-green mx-auto mb-4 inline-flex h-[84px] w-[84px] items-center justify-center rounded-full">
            <Check size={42} aria-hidden />
          </div>
          <Heading level="h2" margin="none" className="mb-2">
            Imported
          </Heading>
          <p className="mb-[22px]">
            <strong className="text-text">{imported.name}</strong> is ready to
            use.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
            <Button color="primary" onClick={handleStartInterview}>
              Start an interview
            </Button>
          </div>
        </div>
      )}
    </HomeModal>
  );
}
