import { safe } from '@orpc/client';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  type ReactNode,
} from 'react';
import { v4 as uuid } from 'uuid';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import type { StageType } from '@codaco/protocol-validation';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { blockedHolders } from './codebook/writes.ts';
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
import {
  useSectionMutation,
  type SectionAccess,
  type SubmitResult,
} from './state/hooks.ts';

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
  /**
   * Whether this editor may write yet.
   *
   * Four states rather than two, because "not editable" covers a stage
   * somebody else holds, one whose acquire has not been answered, and one the
   * protocol would not open at all: they read differently — only the first has
   * a holder to name, and only the last is worth saying rather than waiting
   * out — and a form that let the researcher type before the host had granted
   * the lock would be a draft the first save loses.
   */
  access: SectionAccess;
  /** Who is editing this stage, when it is somebody else. */
  holder: Presence | undefined;
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
  const { submit, access, holder } = section;

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
      // Carried by the submit rather than committed before it: the section and
      // the bytes it names are one revision, so a refused save leaves the
      // files staged for the next attempt instead of committing them for a
      // stage nobody saved.
      const promotion = staged.promotion();
      const result = await submit(stageDocument(identity, fields), promotion);
      if (result.status === 'written') {
        staged.promoted();
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
      access,
      holder,
      save,
    }),
    [access, formId, holder, identity, opened, save],
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
      // Carried by the create for the reason a submit cannot cover: a stage
      // being added can hold a file the researcher imported while composing
      // it, and there is no earlier revision of that stage to have promoted it
      // with. The section, its place in the stage order and the manifest
      // entries are one revision.
      const promotion = staged.promotion();
      const { data, definedError, isSuccess } = await safe(
        client.create({
          protocolId,
          // One id for this attempt to add the stage, so a transport that
          // re-sends the request after a lost answer is told which section the
          // first attempt made rather than adding a second copy of the stage
          // the client would never learn about. Minted per save rather than
          // per edit: an add the host refused is one the researcher fixes and
          // asks for again, and that is a different intent.
          requestId: uuid(),
          kind: 'stage',
          document: stageDocument(identity, fields),
          position,
          ...(promotion === undefined ? {} : { promote: promotion }),
        }),
      );
      if (!isSuccess) {
        // Every one of these left the protocol exactly as it was, so the draft
        // stays: the stage was not added, and adding it again once the reason
        // has passed is what the researcher will do next.
        if (definedError?.code === 'PROMOTION_FAILED') {
          return { status: 'refused', message: PROMOTION_FAILED_MESSAGE };
        }
        if (definedError?.code === 'SECTIONS_LOCKED') {
          return {
            status: 'refused',
            message: blockedMessage(blockedHolders(definedError.data.blocked)),
          };
        }
        return {
          status: 'refused',
          message:
            definedError?.code === 'INVALID_SHAPE'
              ? INVALID_SHAPE_MESSAGE
              : ADD_FAILED_MESSAGE,
        };
      }
      staged.promoted();
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
      // No lock to wait for: the host mints the section and serialises the
      // call, so a stage being added is editable from its first keystroke.
      access: 'editing',
      holder: undefined,
      save,
    }),
    [committedFields, creation, formId, identity, save],
  );

  return <StageEditContext value={edit}>{children}</StageEditContext>;
}

/**
 * What a refused submit does to the draft on screen.
 *
 * A lost lock and a document the section cannot hold are both the end of this
 * draft: the editor may not write, or what it wrote is not a stage. A refused
 * promotion and a section somebody else is holding are not — the submit wrote
 * nothing at all, and saving again once they are finished is a thing that can
 * work — so the draft stays where the researcher left it.
 */
function refusalFromHost(result: SubmitResult): StageSaveOutcome {
  if (result.status === 'promotionFailed') {
    return { status: 'refused', message: PROMOTION_FAILED_MESSAGE };
  }
  if (result.status === 'sectionsLocked') {
    return {
      status: 'refused',
      message: blockedMessage(blockedHolders(result.blocked)),
    };
  }
  return result.status === 'notLockHolder'
    ? { status: 'lost', message: LOCK_LOST_MESSAGE }
    : { status: 'lost', message: INVALID_SHAPE_MESSAGE };
}

/**
 * A save the protocol would not take because somebody else is holding a
 * section it writes: not this stage — the editor holds that — but the stage
 * order a new stage is registered in, or the list of files a promotion adds
 * to.
 *
 * The holders are named the way a refused codebook change names them, because
 * it is the same fact about the same protocol; what differs is that nothing
 * here is lost, so the sentence says the draft is still on screen.
 */
function blockedMessage(holders: readonly string[]): string {
  const [holder, ...rest] = holders;
  if (holder === undefined) {
    return createMessageError(messages.blockedBySomeoneUnnamed);
  }
  return rest.length === 0
    ? createMessageError(messages.blockedBy, { holder })
    : createMessageError(messages.blockedBySeveral, {
        holders: { list: [holder, ...rest] },
      });
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
  promotionFailed: {
    id: 'protocolBuilder.stageEdit.promotionFailed',
    defaultMessage:
      'The files you imported could not be saved with this stage, so nothing was saved and your changes are still here. Try saving again.',
    description:
      'Shown above a stage editor’s fields when the host would not take the files imported during this edit, so neither they nor the stage were saved. The researcher’s unsaved work is still on screen. A stage is one step of an interview.',
  },
  blockedBySomeoneUnnamed: {
    id: 'protocolBuilder.stageEdit.blockedBySomeoneUnnamed',
    defaultMessage:
      'Another part of the protocol that this save needs is being edited, so nothing was saved and your changes are still here. Try saving again in a moment.',
    description:
      'Shown above a stage editor’s fields when the save was refused because somebody the host would not name is editing another part of the protocol the save has to write. The researcher’s unsaved work is still on screen. A stage is one step of an interview.',
  },
  blockedBy: {
    id: 'protocolBuilder.stageEdit.blockedBy',
    defaultMessage:
      '{holder} is editing another part of the protocol that this save needs, so nothing was saved and your changes are still here. Try saving again in a moment.',
    description:
      'Shown above a stage editor’s fields when the save was refused because a named collaborator is editing another part of the protocol the save has to write. holder is that person’s display name, which the host supplies. The researcher’s unsaved work is still on screen. A stage is one step of an interview.',
  },
  blockedBySeveral: {
    id: 'protocolBuilder.stageEdit.blockedBySeveral',
    defaultMessage:
      '{holders} are editing other parts of the protocol that this save needs, so nothing was saved and your changes are still here. Try saving again in a moment.',
    description:
      'Shown above a stage editor’s fields when the save was refused because several named collaborators are between them editing the other parts of the protocol the save has to write. holders is their display names, which the host supplies, joined as a list. The researcher’s unsaved work is still on screen. A stage is one step of an interview.',
  },
  addFailed: {
    id: 'protocolBuilder.stageEdit.addFailed',
    defaultMessage:
      'This stage could not be added. Wait a moment and try again.',
    description:
      'Shown above a stage editor’s fields when adding a new stage failed for a reason that carried no explanation of its own. A stage is one step of an interview.',
  },
});

/**
 * Read by the shell too: a stage whose acquire has not been answered refuses a
 * save in the same words, and the sentence has one declaration.
 */
export const NOT_READY_MESSAGE = createMessageError(messages.notReady);
const LOCK_LOST_MESSAGE = createMessageError(messages.lockLost);
const INVALID_SHAPE_MESSAGE = createMessageError(messages.invalidShape);
const ADD_FAILED_MESSAGE = createMessageError(messages.addFailed);
const PROMOTION_FAILED_MESSAGE = createMessageError(messages.promotionFailed);
