import { useCallback, useEffect, useId, useState, type DragEvent } from 'react';
import { v4 as uuid } from 'uuid';

import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useResourceGateway } from '../context.tsx';
import {
  RESOURCE_UPLOAD_MAX_BYTE_LENGTH,
  type ProtocolBuilderResourceGateway,
  type ResourceDescriptor,
  type ResourceResult,
  type StageUploadRequest,
} from '../gateway.ts';
import { discardAbandonedStaging } from './abandonedStaging.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import {
  acceptedExtensions,
  contentKindForFile,
  contentTypeForFile,
  oversizeFileMessage,
  sourceFilename,
  unsupportedFileMessage,
  type ResourcePickerKind,
} from './resourceKinds.ts';
import { useResourceAttempt } from './useResourceAttempt.ts';

const messages = defineMessages({
  unreadable: {
    id: 'protocolBuilder.resourceUpload.unreadable',
    defaultMessage:
      'That file could not be read. Choose it again, or try a different file.',
    description:
      'Refusal shown when the browser could not read the bytes of the file a researcher chose — it was moved, renamed, or is unreadable.',
  },
  dropHint: {
    id: 'protocolBuilder.resourceUpload.dropHint',
    defaultMessage: 'Drag and drop a file here to import it.',
    description:
      'Instruction inside the drop target of the file-import area. The keyboard-operable file input sits below it.',
  },
  chooseFile: {
    id: 'protocolBuilder.resourceUpload.chooseFile',
    defaultMessage: 'Choose a file from your computer',
    description:
      'Label of the file input a researcher uses to import a file into their protocol.',
  },
  retry: {
    id: 'protocolBuilder.resourceUpload.retry',
    defaultMessage: 'Try importing the file again',
    description:
      'Button beside a failure notice, which repeats the import of the same file. Named rather than generic because several parts of the dialog can be failing at once.',
  },
  importingAnnouncement: {
    id: 'protocolBuilder.resourceUpload.importingAnnouncement',
    defaultMessage: 'Importing the file…',
    description:
      'Announced to assistive technology while a chosen file is being imported.',
  },
  importedAnnouncement: {
    id: 'protocolBuilder.resourceUpload.importedAnnouncement',
    defaultMessage: '{name} was imported.',
    description:
      'Announced to assistive technology once a file has been imported. name is the filename the researcher chose.',
  },
});

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
  /**
   * Reports whether this control is holding work a dismissal would lose.
   *
   * The dialog around it decides what to do about that; nothing here changes
   * because of it. Reported rather than inferred because the draft lives in
   * this control's own state and nowhere the dialog can see.
   */
  onDraftChange?: (hasDraft: boolean) => void;
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
  onDraftChange,
  disabled = false,
}: ResourceUploadControlProps) {
  const gateway = useResourceGateway();
  const intl = useAppIntl();
  const { begin, busy, failure, retry } = useResourceAttempt();
  const inputId = useId();
  /**
   * Why the file the researcher chose was refused, encoded rather than
   * formatted: a refusal sits here until another file replaces it, so it is
   * decoded where it is rendered and follows a change of language while it
   * waits.
   */
  const [rejected, setRejected] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  /**
   * A file has been chosen and its bytes are being read, which is work of the
   * researcher's that no gateway call has started yet.
   *
   * `busy` cannot stand for this on its own: the read happens before any call
   * is made, so a control that reported only `busy` would report nothing for
   * the whole of it — and reading the file a researcher picked by mistake is
   * exactly the long part.
   */
  const [reading, setReading] = useState(false);

  // A file the researcher has chosen, from the moment they choose it until the
  // import settles: reading it, then staging it. It is not typed work, but it
  // is a choice they made that nothing else records — dismissing here throws
  // the import away and the file has to be found again.
  useEffect(() => {
    onDraftChange?.(reading || busy);
    return () => onDraftChange?.(false);
  }, [busy, onDraftChange, reading]);

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
      // Held as a draft from the same moment and for the same reason: the
      // checks below and the read after them all happen while a dismissal
      // could arrive, and none of them has started a call for `busy` to show.
      setReading(true);

      const contentKind = contentKindForFile(kind, file.name);
      if (contentKind === undefined) {
        setRejected(unsupportedFileMessage(kind));
        // A refused file is not work to lose: the refusal on screen is the
        // whole of what happened, and it survives a dismissal by being about
        // a choice the researcher will make again.
        setReading(false);
        return;
      }

      // Before the file is read, not after: staging takes the bytes, so a
      // control that waits for the host to refuse has already pulled a file
      // of any size into memory to be told what its own `size` said all
      // along — and the file picked by mistake is the large one.
      if (file.size > RESOURCE_UPLOAD_MAX_BYTE_LENGTH) {
        setRejected(oversizeFileMessage(RESOURCE_UPLOAD_MAX_BYTE_LENGTH));
        setReading(false);
        return;
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        // A file the researcher has already moved off is not something to
        // report at all: the import that replaced it is what is happening now.
        // Its draft is that import's to hold as well, so this leaves it be —
        // saying there is nothing to lose would be saying it about the choice
        // that superseded this one.
        if (!claim.current()) return;
        setRejected(createMessageError(messages.unreadable));
        setReading(false);
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
          setStatus(
            intl.formatMessage(messages.importedAnnouncement, {
              name: descriptor.name,
            }),
          );
          onStaged(descriptor);
        },
        // The import landed with nothing left to hand it to: another file was
        // chosen, or the browser was closed. No field will ever name it, so
        // the host is told to let it go.
        (descriptor) => discardAbandonedStaging(gateway, descriptor),
      );
      // After the call has started, so the draft passes from this flag to
      // `busy` without ever being reported as nothing in between.
      setReading(false);
    },
    [begin, gateway, intl, kind, onStaged],
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
          {intl.formatMessage(messages.dropHint)}
        </Paragraph>
        <div className="flex flex-col items-center gap-1">
          <label htmlFor={inputId}>
            {intl.formatMessage(messages.chooseFile)}
          </label>
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
          {formatMessageError(rejected, intl) ?? rejected}
        </div>
      )}

      {failure !== undefined && (
        <ResourceFailureNotice
          failure={failure}
          onRetry={retry}
          retryLabel={intl.formatMessage(messages.retry)}
          busy={busy}
        />
      )}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {busy ? intl.formatMessage(messages.importingAnnouncement) : status}
      </span>
    </div>
  );
}
