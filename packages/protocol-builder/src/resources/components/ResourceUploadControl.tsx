import { useCallback, useId, useState, type DragEvent } from 'react';
import { v4 as uuid } from 'uuid';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useResourceGateway } from '../context.tsx';
import type {
  ProtocolBuilderResourceGateway,
  ResourceDescriptor,
  ResourceResult,
  StageUploadRequest,
} from '../gateway.ts';
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

/**
 * Imports one file: stages the bytes, then asks the host to read back what it
 * staged.
 *
 * A host that will hold any bytes is not a host that can tell a roster from a
 * text file, and staging is where the researcher finds out — a field left
 * pointing at content the interview cannot read is a protocol that fails when
 * it is used, and nothing in the manifest says so. So the import is not
 * finished until the host has read the resource: only then is there something
 * a field may point at.
 *
 * Content the host cannot read is dropped again rather than left staged. The
 * researcher is going to choose another file, and this one would otherwise sit
 * at the host until the finish walked away from it. A host that could not
 * answer at all keeps its staged resource, because repeating the identical
 * request is exactly what "try again" then means.
 */
async function importFile(
  gateway: ProtocolBuilderResourceGateway,
  request: StageUploadRequest,
): Promise<ResourceResult<ResourceDescriptor>> {
  const staged = await gateway.stageUpload(request);
  if (staged.status !== 'ok') return staged;

  const inspected = await gateway.inspect(staged.data.id);
  if (inspected.status === 'ok') return staged;
  if (inspected.failure.reason === 'invalid-content') {
    await gateway.discardStaged(staged.data.id);
  }
  return Object.freeze({
    status: 'failed' as const,
    failure: inspected.failure,
  });
}

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
  const { begin, busy, failure, retry } = useResourceAttempt();
  const inputId = useId();
  const [rejected, setRejected] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);

  const stageFile = useCallback(
    async (file: File) => {
      setRejected(undefined);
      // Claimed before anything about this file is decided, because the claim
      // is the researcher's choice rather than its consequence. Reading a
      // large first choice can still be under way when a second one is made,
      // and the field must end up holding the file chosen last — including
      // when that file is one this field cannot hold, which supersedes the
      // earlier choice just as surely as an accepted one does. Claiming also
      // takes away what the previous choice left on screen, so the refusal
      // below is the only thing the researcher is being told.
      const claim = begin();

      const contentKind = contentKindForFile(kind, file.name);
      if (contentKind === undefined) {
        setRejected(unsupportedFileMessage(kind));
        return;
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        // A file the researcher has already moved off is not something to
        // report at all: the import that replaced it is what is happening now.
        if (!claim.current()) return;
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
          importFile(gateway, {
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
    [begin, gateway, kind, onStaged],
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
