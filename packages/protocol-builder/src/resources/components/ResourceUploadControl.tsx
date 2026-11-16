import { Redacted } from 'effect';
import { Upload } from 'lucide-react';
import { useEffect, useId, useState, type DragEvent } from 'react';
import { v4 as uuid } from 'uuid';

import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useResourceClient, type ResourceClient } from '../client.tsx';
import { oversizeFileMessage } from '../resourceMessages.ts';
import { readRosterFacts } from '../rosterFacts.ts';
import {
  RESOURCE_UPLOAD_MAX_BYTE_LENGTH,
  type ResourceContentKind,
  type ResourceDescriptor,
  type ResourceResult,
  type StageUploadRequest,
} from '../types.ts';
import { discardAbandonedStaging } from './abandonedStaging.ts';
import {
  type NodeShapeNotice,
  prepareNodeShapeUpload,
} from './nodeShapeResource.ts';
import ResourceFailureNotice from './ResourceFailureNotice.tsx';
import {
  acceptedExtensions,
  contentKindForFile,
  contentTypeForFile,
  sourceFilename,
  unsupportedFileMessage,
  type ResourcePickerKind,
} from './resourceKinds.ts';
import { rosterCharacterRefusal } from './rosterCharacters.ts';
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
  resources: ResourceClient,
  request: StageUploadRequest,
): Promise<ResourceResult<ResourceDescriptor>> {
  const staged = await resources.stageUpload(request);
  if (staged.status !== 'ok') return staged;

  const inspected = await resources.inspect(staged.data.id);
  if (inspected.status === 'ok') return staged;
  if (inspected.failure.reason === 'invalid-content') {
    await resources.discardStaged(staged.data.id);
  }
  return Object.freeze({
    status: 'failed' as const,
    failure: inspected.failure,
  });
}

type PreparedImport =
  /** Another file was chosen meanwhile, or the control has gone. */
  | Readonly<{ status: 'superseded' }>
  | Readonly<{ status: 'refused'; error: string }>
  | Readonly<{
      status: 'ready';
      contentKind: ResourceContentKind;
      bytes: Uint8Array;
      contentType: string;
      nodeShape?: NodeShapeNotice;
    }>;

const SUPERSEDED: PreparedImport = { status: 'superseded' };

const refused = (error: string): PreparedImport => ({
  status: 'refused',
  error,
});

/**
 * Everything decided about a chosen file before anything is staged: whether
 * this control takes it, its bytes, and, for a shape or a roster, whether
 * those bytes can be used at all.
 *
 * `current` is asked after every wait, because reading a large first choice
 * can still be under way when a second one is made, and only the file chosen
 * last may go on to be staged.
 */
async function prepareImport(
  kind: ResourceUploadControlProps['kind'],
  file: File,
  current: () => boolean,
): Promise<PreparedImport> {
  const contentKind = contentKindForFile(kind, file.name);
  if (contentKind === undefined) return refused(unsupportedFileMessage(kind));

  // Before the file is read, not after: staging takes the bytes, so a
  // control that waits for the host to refuse has already pulled a file of
  // any size into memory to be told what its own `size` said all along — and
  // the file picked by mistake is the large one.
  if (file.size > RESOURCE_UPLOAD_MAX_BYTE_LENGTH) {
    return refused(oversizeFileMessage(RESOURCE_UPLOAD_MAX_BYTE_LENGTH));
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    // A file the researcher has already moved off is not something to report
    // at all: the import that replaced it is what is happening now.
    return current()
      ? refused(createMessageError(messages.unreadable))
      : SUPERSEDED;
  }
  if (!current()) return SUPERSEDED;

  let contentType = contentTypeForFile(file.name, file.type);
  let nodeShape: NodeShapeNotice | undefined;
  if (kind === 'nodeShape') {
    const shape = prepareNodeShapeUpload(file.name, bytes);
    if ('error' in shape) return refused(shape.error);
    ({ bytes, contentType } = shape);
    nodeShape = shape.notice;
  }

  // Read here, before anything is staged, because a host only has to hold a
  // roster's bytes and need not read them: a character no export can carry
  // would otherwise be found when the data is exported, and a roster the
  // interview cannot load, such as one with a heading it cannot match, when a
  // participant reaches the stage — both long after the researcher could
  // still choose a corrected file.
  if (contentKind === 'network') {
    const refusal = await rosterCharacterRefusal(bytes, file.name);
    if (!current()) return SUPERSEDED;
    if (refusal !== undefined) return refused(refusal);

    const roster = await readRosterFacts({
      bytes,
      contentType,
      source: file.name,
    });
    if (!current()) return SUPERSEDED;
    if ('unreadable' in roster) return refused(roster.unreadable);
  }

  return {
    status: 'ready',
    contentKind,
    bytes,
    contentType,
    ...(nodeShape === undefined ? {} : { nodeShape }),
  };
}

export type ResourceUploadControlProps = Readonly<{
  /** Which kinds this control will accept, and what it stages them as. */
  kind: Exclude<ResourcePickerKind, 'apikey'>;
  /**
   * Called with the staged resource. A node shape picker also says what was
   * taken out of the SVG on the way in.
   */
  onStaged: (
    descriptor: ResourceDescriptor,
    nodeShape?: NodeShapeNotice,
  ) => void;
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
 * Imports a file into this edit, through the resource client alone.
 *
 * The drop target is a pointer shortcut; the labelled file input is the
 * keyboard-operable path.
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
  const resources = useResourceClient();
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
  /**
   * What was announced last. English in every language, because it is read
   * only by a screen reader.
   */
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  /**
   * A file has been chosen and its bytes are being read, which is work of the
   * researcher's that no host call has started yet.
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

  const stageFile = async (file: File) => {
    setRejected(undefined);
    // Claimed before anything about this file is decided, because the claim
    // is the researcher's choice rather than its consequence: the field must
    // end up holding the file chosen last, including when that file is one
    // this field cannot hold. Claiming also takes away what the previous
    // choice left on screen, so a refusal is the only thing the researcher
    // is being told.
    const claim = begin();
    // Held as a draft from the same moment and for the same reason: the
    // checks and the read all happen while a dismissal could arrive, and
    // none of them has started a call for `busy` to show.
    setReading(true);

    let prepared: PreparedImport | undefined;
    try {
      prepared = await prepareImport(kind, file, claim.current);
      if (prepared.status === 'refused') setRejected(prepared.error);
      if (prepared.status !== 'ready') return;

      const { contentKind, bytes, contentType, nodeShape } = prepared;
      const source = sourceFilename(file.name);
      // One id for this file, kept across a retry: repeating an uncertain
      // import must not leave the protocol holding the same file twice.
      const requestId = uuid();
      setStatus('');
      claim.run(
        () =>
          importFile(resources, {
            requestId,
            kind: contentKind,
            name: source,
            source,
            contentType,
            bytes,
          }),
        (descriptor) => {
          setStatus(`${Redacted.value(descriptor.name)} was imported.`);
          onStaged(descriptor, nodeShape);
        },
        // The import landed with nothing left to hand it to: another file
        // was chosen, or the browser was closed. No field will ever name
        // it, so the host is told to let it go.
        (descriptor) => discardAbandonedStaging(resources, descriptor),
      );
    } finally {
      // A refused file is not work to lose, and a started import is held by
      // `busy` from here on. A superseded choice leaves the draft alone: it
      // belongs to the choice that replaced it.
      if (prepared?.status !== 'superseded') setReading(false);
    }
  };

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
        className="bg-input text-input-contrast border-input-contrast/30 data-dragging:border-primary data-dragging:bg-primary/10 flex min-h-36 flex-col items-center justify-center gap-3 rounded border-2 border-dashed p-6 text-center transition-[border-color,background-color] duration-150 motion-reduce:transition-none"
      >
        <Paragraph margin="none">
          {intl.formatMessage(messages.dropHint)}
        </Paragraph>
        <input
          id={inputId}
          type="file"
          accept={acceptedExtensions(kind).join(',')}
          disabled={disabled || busy}
          className="peer sr-only"
          onChange={(event) => {
            const file = event.target.files?.item(0);
            // Cleared so choosing the same file twice — after a failure the
            // researcher has since fixed — still raises a change event.
            event.target.value = '';
            if (file != null) void stageFile(file);
          }}
        />
        <Button asChild color="primary" icon={<Upload aria-hidden="true" />}>
          <label
            htmlFor={inputId}
            className="peer-focus-visible:focus-styles peer-focus-visible:outline-primary peer-disabled:active:elevation-low! peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-disabled:active:translate-y-0!"
          >
            {intl.formatMessage(messages.chooseFile)}
          </label>
        </Button>
      </div>

      {rejected !== undefined && (
        <div role="alert" className="text-destructive-ink text-sm">
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

      <span className="sr-only" aria-live="polite" aria-atomic="true" lang="en">
        {busy ? 'Importing the file…' : status}
      </span>
    </div>
  );
}
