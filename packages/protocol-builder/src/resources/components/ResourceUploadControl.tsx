import { useCallback, useId, useState, type DragEvent } from 'react';
import { v4 as uuid } from 'uuid';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useResourceGateway } from '../context.tsx';
import type { ResourceDescriptor } from '../gateway.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import {
  acceptedExtensions,
  contentKindForFile,
  contentTypeForFile,
  sourceFilename,
  unsupportedFileMessage,
  type ResourcePickerKind,
} from './resourceKinds.ts';
import { useResourceAttempt } from './useResourceAttempt.ts';

const UNREADABLE_MESSAGE =
  'That file could not be read. Choose it again, or try a different file.';

export type ResourceUploadControlProps = Readonly<{
  /** Which kinds this control will accept, and what it stages them as. */
  kind: Exclude<ResourcePickerKind, 'apikey'>;
  onStaged: (descriptor: ResourceDescriptor) => void;
  disabled?: boolean;
}>;

/**
 * Imports a file into this editing session, through the gateway alone.
 *
 * Two ways in, deliberately: a drop target for a pointer, and a file input
 * that is a real, labelled, focusable control rather than a visually hidden
 * one behind the drop target — dropping a file is not something a keyboard can
 * do, so the input is the operable path and the drop target is the shortcut.
 *
 * The file is staged, not committed: it takes its asset id immediately so the
 * field can reference it, and the host holds the bytes outside the protocol
 * until the stage is finished.
 */
export default function ResourceUploadControl({
  kind,
  onStaged,
  disabled = false,
}: ResourceUploadControlProps) {
  const gateway = useResourceGateway();
  const { begin, busy, clear, failure, retry } = useResourceAttempt();
  const inputId = useId();
  const [rejected, setRejected] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);

  const stageFile = useCallback(
    async (file: File) => {
      setRejected(undefined);
      const contentKind = contentKindForFile(kind, file.name);
      if (contentKind === undefined) {
        setRejected(unsupportedFileMessage(kind));
        return;
      }

      // Claimed before the file is read, because reading is part of importing
      // this file: a large first choice can still be reading when a smaller
      // second one is already staged, and the file the researcher chose last
      // is the one the field must end up holding.
      const claim = begin();

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        // A file the researcher has already moved off is not something to
        // report, and clearing would disown the import that replaced it.
        if (!claim.current()) return;
        clear();
        setRejected(UNREADABLE_MESSAGE);
        return;
      }
      if (!claim.current()) return;

      const source = sourceFilename(file.name);
      // One id for this file, kept across a retry: repeating an uncertain
      // import must not leave the protocol holding the same file twice.
      const requestId = uuid();
      setStatus('');
      claim.run(
        () =>
          gateway.stageUpload({
            requestId,
            kind: contentKind,
            name: source,
            source,
            contentType: contentTypeForFile(file.name, file.type),
            bytes,
          }),
        (descriptor) => {
          setStatus(`${descriptor.name} was imported.`);
          onStaged(descriptor);
        },
      );
    },
    [begin, clear, gateway, kind, onStaged],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || busy) return;
    const file = event.dataTransfer.files.item(0);
    if (file !== null) void stageFile(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        data-dragging={dragging ? '' : undefined}
        className="border-input-contrast/30 data-dragging:border-primary data-dragging:bg-primary/10 flex flex-col items-center gap-3 rounded border-2 border-dashed p-6 text-center"
      >
        <Paragraph margin="none">
          Drag and drop a file here to import it.
        </Paragraph>
        <div className="flex flex-col items-center gap-1">
          <label htmlFor={inputId}>Choose a file from your computer</label>
          <input
            id={inputId}
            type="file"
            accept={acceptedExtensions(kind).join(',')}
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.item(0);
              // Cleared so choosing the same file twice — after a failure the
              // researcher has since fixed — still raises a change event.
              event.target.value = '';
              if (file != null) void stageFile(file);
            }}
          />
        </div>
      </div>

      {rejected !== undefined && (
        <div role="alert" className="text-destructive text-sm">
          {rejected}
        </div>
      )}

      {failure !== undefined && (
        <ResourceFailureNotice
          failure={failure}
          onRetry={retry}
          retryLabel="Try importing the file again"
          busy={busy}
        />
      )}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {busy ? 'Importing the file…' : status}
      </span>
    </div>
  );
}
