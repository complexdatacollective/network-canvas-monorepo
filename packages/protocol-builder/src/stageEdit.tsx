import { safe } from '@orpc/client';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  type ReactNode,
} from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { StageType } from '@codaco/protocol-validation';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import type { Presence } from './contract/schemas.ts';
import { getInterfaceTemplate } from './interfaces/templates.ts';
import { useStagedResources } from './resources/client.tsx';
import {
  createStageIdentity,
  stageDocument,
  stageDraftFromDocument,
  type StageCreation,
  type StageFormDraft,
  type StageIdentity,
} from './stageDocument.ts';
import { useProtocolBuilderContext } from './state/context.ts';
import { useSectionMutation, type SubmitResult } from './state/hooks.ts';

/**
 * Which stage an editor is open on: one the protocol already holds, or one it
 * does not hold yet.
 */
export type StageEditTarget =
  | Readonly<{ sectionId: ProtocolSectionId }>
  | Readonly<{
      stageType: StageType;
      /** Where the stage lands in the stage order, counting from zero. */
      position: number;
      /** Fields on top of the interface's own template. */
      fields?: StageFormDraft;
    }>;

export type StageSaveOutcome =
  | Readonly<{ status: 'saved'; sectionId: ProtocolSectionId }>
  /** The stage is somebody else's now; this draft is gone and cannot be retried. */
  | Readonly<{ status: 'lost'; message: string }>
  | Readonly<{ status: 'refused'; message: string }>;

export type StageEdit = Readonly<{
  formId: string;
  /** Section-owned identity; absent until the host has handed the stage over. */
  identity: StageIdentity | undefined;
  creation: StageCreation | undefined;
  committedFields: StageFormDraft | undefined;
  readOnly: boolean;
  /** Who is editing this stage, when it is somebody else. */
  holder: Presence | undefined;
  /** The protocol would not open this stage: it is gone, or out of reach. */
  unavailable: boolean;
  save(fields: StageFormDraft): Promise<StageSaveOutcome>;
}>;

const StageEditContext = createContext<StageEdit | null>(null);

export function useStageEdit(): StageEdit {
  const edit = useContext(StageEditContext);
  if (edit === null) {
    throw new Error('a stage editor was rendered outside an open stage edit');
  }
  return edit;
}

export type StageEditProps = Readonly<{
  target: StageEditTarget;
  /** The DOM id of the stage form, when the host wants to name it. */
  formId?: string;
  onSaved?: (sectionId: ProtocolSectionId) => void;
  children: ReactNode;
}>;

/**
 * Opens one stage for editing, and holds it open for whatever is inside.
 *
 * Editing an existing stage takes its lock and keeps it until this unmounts,
 * which is also when whatever the edit staged is discarded; creating one takes
 * no lock at all, because the host mints the section and serialises the call.
 * Two components rather than one branch inside a hook, so that changing which
 * of the two a host asked for remounts the edit rather than reordering its
 * hooks.
 */
export function StageEditSession({
  target,
  formId,
  onSaved,
  children,
}: StageEditProps) {
  return 'stageType' in target ? (
    <CreatingStage target={target} formId={formId} onSaved={onSaved}>
      {children}
    </CreatingStage>
  ) : (
    <EditingStage
      sectionId={target.sectionId}
      formId={formId}
      onSaved={onSaved}
    >
      {children}
    </EditingStage>
  );
}

function useFormId(requested: string | undefined): string {
  const generated = useId();
  return requested ?? `protocol-builder-${generated}`;
}

/**
 * A stage the protocol already holds.
 *
 * The lock is what makes the form the document's only copy: nobody else can
 * change the section while it is held, so nothing in the editor re-reads it at
 * write time and the submit hands the whole thing back.
 */
function EditingStage({
  sectionId,
  formId: requestedFormId,
  onSaved,
  children,
}: Readonly<{
  sectionId: ProtocolSectionId;
  formId?: string;
  onSaved?: (sectionId: ProtocolSectionId) => void;
  children: ReactNode;
}>) {
  const formId = useFormId(requestedFormId);
  const section = useSectionMutation(sectionId);
  const staged = useStagedResources();
  const { submit, readOnly, holder, unavailable } = section;

  const opened = useMemo(
    () =>
      section.document === undefined
        ? undefined
        : stageDraftFromDocument(section.document),
    [section.document],
  );
  const identity = opened?.identity;

  const save = useCallback(
    async (fields: StageFormDraft): Promise<StageSaveOutcome> => {
      if (identity === undefined) {
        return { status: 'refused', message: NOT_READY_MESSAGE };
      }
      // Before the stage that names them: a file promoted after a refused
      // submit would be committed for a stage nobody saved.
      const promoted = await staged.promote();
      if (promoted.status === 'failed') {
        return { status: 'refused', message: promoted.failure.message };
      }
      const result = await submit(stageDocument(identity, fields));
      if (result.status === 'written') {
        onSaved?.(sectionId);
        return { status: 'saved', sectionId };
      }
      return refusalFromHost(result);
    },
    [identity, onSaved, sectionId, staged, submit],
  );

  const edit = useMemo<StageEdit>(
    () => ({
      formId,
      identity,
      creation: undefined,
      committedFields: opened?.fields,
      readOnly,
      holder,
      unavailable,
      save,
    }),
    [formId, holder, identity, opened, readOnly, save, unavailable],
  );

  return <StageEditContext value={edit}>{children}</StageEditContext>;
}

/**
 * A stage the protocol does not hold yet.
 *
 * No lock: `create` is atomic in the host, which mints the section id and
 * registers the stage's place in the stage order in the same revision.
 */
function CreatingStage({
  target,
  formId: requestedFormId,
  onSaved,
  children,
}: Readonly<{
  target: Readonly<{
    stageType: StageType;
    position: number;
    fields?: StageFormDraft;
  }>;
  formId?: string;
  onSaved?: (sectionId: ProtocolSectionId) => void;
  children: ReactNode;
}>) {
  const formId = useFormId(requestedFormId);
  const { client, protocolId } = useProtocolBuilderContext();
  const staged = useStagedResources();
  const { stageType, position } = target;
  const extraFields = target.fields;

  // Settled once, so a create edits one stage under one id from its first
  // keystroke even though the host mints the id it finally lands under.
  const identity = useMemo(() => createStageIdentity(stageType), [stageType]);
  const committedFields = useMemo(
    () => Object.freeze({ ...getInterfaceTemplate(stageType), ...extraFields }),
    [extraFields, stageType],
  );
  const creation = useMemo(() => ({ position }), [position]);

  const save = useCallback(
    async (fields: StageFormDraft): Promise<StageSaveOutcome> => {
      const promoted = await staged.promote();
      if (promoted.status === 'failed') {
        return { status: 'refused', message: promoted.failure.message };
      }
      const { data, definedError, isSuccess } = await safe(
        client.create({
          protocolId,
          kind: 'stage',
          document: stageDocument(identity, fields),
          position,
        }),
      );
      if (!isSuccess) {
        return {
          status: 'refused',
          message:
            definedError?.code === 'INVALID_SHAPE'
              ? INVALID_SHAPE_MESSAGE
              : ADD_FAILED_MESSAGE,
        };
      }
      onSaved?.(data.sectionId);
      return { status: 'saved', sectionId: data.sectionId };
    },
    [client, identity, onSaved, position, protocolId, staged],
  );

  const edit = useMemo<StageEdit>(
    () => ({
      formId,
      identity,
      creation,
      committedFields,
      readOnly: false,
      holder: undefined,
      // A stage the protocol does not hold yet cannot have gone.
      unavailable: false,
      save,
    }),
    [committedFields, creation, formId, identity, save],
  );

  return <StageEditContext value={edit}>{children}</StageEditContext>;
}

function refusalFromHost(result: SubmitResult): StageSaveOutcome {
  return result.status === 'notLockHolder'
    ? { status: 'lost', message: LOCK_LOST_MESSAGE }
    : { status: 'lost', message: INVALID_SHAPE_MESSAGE };
}

const messages = defineMessages({
  notReady: {
    id: 'protocolBuilder.stageEdit.notReady',
    defaultMessage:
      'This stage is still opening, so there was nothing to save. Wait a moment and try again.',
    description:
      'Refusal shown when a save is asked for before the stage has finished opening. A stage is one step of an interview.',
  },
  lockLost: {
    id: 'protocolBuilder.stageEdit.lockLost',
    defaultMessage:
      'Somebody else is editing this stage now, so nothing was saved and your unsaved changes have been discarded. Reopen the stage to see their version.',
    description:
      'Shown above a stage editor’s fields when the researcher no longer holds the right to edit this stage and their save was refused because of it. Their unsaved work is gone. A stage is one step of an interview.',
  },
  invalidShape: {
    id: 'protocolBuilder.stageEdit.invalidShape',
    defaultMessage:
      'This stage is not something the protocol can hold, so nothing was saved and your unsaved changes have been discarded.',
    description:
      'Shown above a stage editor’s fields when the host refused the save because the stage was the wrong shape. A stage is one step of an interview.',
  },
  addFailed: {
    id: 'protocolBuilder.stageEdit.addFailed',
    defaultMessage:
      'This stage could not be added. Wait a moment and try again.',
    description:
      'Shown above a stage editor’s fields when adding a new stage failed for a reason that carried no explanation of its own. A stage is one step of an interview.',
  },
});

const NOT_READY_MESSAGE = createMessageError(messages.notReady);
const LOCK_LOST_MESSAGE = createMessageError(messages.lockLost);
const INVALID_SHAPE_MESSAGE = createMessageError(messages.invalidShape);
const ADD_FAILED_MESSAGE = createMessageError(messages.addFailed);
