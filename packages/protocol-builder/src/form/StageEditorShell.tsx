import { LayoutGroup } from 'motion/react';
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import FormErrorsList from '@codaco/fresco-ui/form/FormErrors';
import { useForm } from '@codaco/fresco-ui/form/hooks/useForm';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { canonicalize, type Command } from '@codaco/studio-sync/apply';

import type { StageEditorController } from '../controller.ts';
import { ResourceGatewayProvider } from '../resources/context.tsx';
import {
  InvalidProtocolDraftError,
  type ProtocolBuilderSnapshot,
  SessionReadOnlyError,
  type StageFormDraft,
} from '../session.ts';
import type { StageEditorActions } from '../stage-editor-contract.ts';
import {
  SectionOutlineStore,
  type SectionValidationIssue,
} from './outlineStore.ts';
import { reseedStageForm } from './reseedStageForm.ts';
import SectionOutline from './SectionOutline.tsx';
import {
  dormantFieldsOf,
  mountedPathsOf,
  stageDraftFromSubmission,
} from './stageDraftFromSubmission.ts';
import {
  type OwnCommandsResult,
  StageEditorFormContext,
} from './stageEditorContext.ts';

/**
 * Where the slot's own types live is `stage-editor-contract.ts`: they are part
 * of what a named editor takes, and the contract is a module of types a host
 * can read without compiling a component tree. Carried on through here because
 * this is the component that calls the slot.
 */
export type {
  StageEditorActionContext,
  StageEditorActions,
} from '../stage-editor-contract.ts';

export type StageEditorShellProps = Readonly<{
  controller: StageEditorController;
  /** The host's action chrome. Receives the controller and the form id. */
  actions?: StageEditorActions;
  children: ReactNode;
  className?: string;
}>;

/**
 * The one form every stage editor is built inside.
 *
 * Every named editor composes sections into this shell, and the shell owns
 * everything a stage editor does regardless of which stage it is editing:
 * one form store, the section outline, the submit that flushes the form into
 * the session, and a slot where the host puts its own buttons.
 *
 * The store provider is keyed by the stage being edited because Fresco forms
 * have no reinitialise: opening a different stage is a different form. It is
 * keyed by NOTHING else — see `reseedStageForm` for what happens instead when
 * the draft for THIS stage is replaced beneath the controls.
 */
export default function StageEditorShell(props: StageEditorShellProps) {
  const { identity } = props.controller.snapshot.editedSection;
  // The content this form itself last wrote into the session. Everything else
  // that moves the draft — undo, redo, an acknowledgement, an authoritative
  // replacement — moved it out from under the controls on screen.
  const flushed = useRef<string | null>(null);
  const committed = useCommittedFields(props.controller.snapshot, flushed);

  return (
    <FormStoreProvider key={`${identity.type}:${identity.id}`}>
      <StageEditorFormBody {...props} committed={committed} flushed={flushed} />
    </FormStoreProvider>
  );
}

function StageEditorFormBody({
  controller,
  actions,
  children,
  className,
  committed,
  flushed,
}: StageEditorShellProps &
  Readonly<{
    committed: CommittedDraft;
    flushed: RefObject<string | null>;
  }>) {
  const storeApi = useContext(FormStoreContext);
  const formRef = useRef<HTMLFormElement>(null);
  const outline = useMemo(() => new SectionOutlineStore(), []);
  const { snapshot, formId } = controller;
  const readOnly = snapshot.access.mode !== 'editable';
  const committedFields = committed.fields;

  /**
   * A structural write the session refused, in the form's own error region.
   *
   * A submit reports its own refusals through the value it answers with, but a
   * list editor's write is not a submit: it happens in a click handler that
   * has nowhere to return an answer to. Without this the refusal is silent —
   * the row simply does not appear — which reads as the editor being broken
   * rather than as the lease having gone.
   *
   * The message describes ONE write that reached nothing, so it stands only
   * until something makes it untrue:
   *
   *   a write of this form's own that DID land — a list operation the session
   *   took, or a submit that finished — or the stage becoming editable again.
   *
   * All three are stated here rather than at the write paths, because a
   * refusal that outlives the state it described is worse than none: the
   * researcher is told nothing was saved while looking at an edit that
   * plainly was. Editing being handed back is included because that is
   * exactly what the read-only message asks for, and it should not have to be
   * read twice. Neither a read of the draft (`applyOwnCommands([])`) nor a
   * write the session refuses may clear it: neither is news.
   */
  const [refusedWrite, setRefusedWrite] = useState<string | undefined>(
    undefined,
  );
  const clearRefusedWrite = useCallback(() => {
    setRefusedWrite(undefined);
  }, []);
  useEffect(() => {
    if (!readOnly) clearRefusedWrite();
  }, [clearRefusedWrite, readOnly]);

  /**
   * The one way a refused structural write is said out loud, wherever the
   * refusal was decided.
   *
   * `applyOwnCommands` below names the refusals it can see for itself — both
   * of the read-only routes — and a list editor names the ones it cannot: a
   * batch the list decided not to dispatch, because the row it named is gone
   * or cannot be told from the rows beside it, reaches the session as nothing
   * at all. Held apart from the state setter so a caller cannot pass an updater
   * and read the message it is replacing.
   */
  const reportRefusedWrite = useCallback((message: string) => {
    setRefusedWrite(message);
  }, []);

  /**
   * The draft moved for a reason that is not this form's own submit, so the
   * controls on screen are showing something that is no longer agreed. They
   * are written to rather than rebuilt: rebuilding would discard everything
   * typed but not yet saved and destroy any row dialog open over the editor —
   * along with the draft inside it, and the message a save in flight was about
   * to report. See `reseedStageForm`.
   */
  const reseededGeneration = useRef(committed.generation);
  /**
   * The agreed draft the controls are already level with, which is what the
   * arrival is compared AGAINST rather than the values on screen.
   *
   * Kept here rather than derived, because it is true of both ways a draft
   * stops being a surprise: a re-seed writes an arrival into the controls, and
   * this form's own flush IS the content that arrived. Only the difference
   * between two agreed drafts says what an arrival decided; the difference
   * between an agreed draft and what is on screen is mostly the researcher
   * typing.
   */
  const levelWith = useRef(committed.fields);
  useEffect(() => {
    if (storeApi === undefined) return;
    const previous = levelWith.current;
    levelWith.current = committed.fields;
    if (reseededGeneration.current === committed.generation) return;
    reseededGeneration.current = committed.generation;
    reseedStageForm(storeApi, committed.fields, previous);
  }, [committed, storeApi]);

  const handleSubmit = useCallback<FormSubmitHandler>(
    async (values) => {
      if (storeApi === undefined) {
        return { success: false, formErrors: [UNAVAILABLE_MESSAGE] };
      }
      if (readOnly) {
        return { success: false, formErrors: [READ_ONLY_MESSAGE] };
      }

      let written: string | null = null;
      try {
        // Inside the guarded block with the finish it precedes: access can be
        // revoked between the render that read it and this submit, and the
        // session refuses a write from a lease it no longer holds. That is an
        // ordinary lease transition, and it belongs in the form's own errors
        // rather than in a rejected submit promise.
        controller.changeFields((current) => {
          const next = stageDraftFromSubmission({
            currentFields: current,
            submittedValues: values as Record<string, FieldValue>,
            mountedPaths: mountedPathsOf(storeApi),
            dormantFields: dormantFieldsOf(storeApi),
          });
          // A submit that changes nothing moves nothing, so it has no
          // transition to explain and leaves no marker: one left standing
          // would spend itself on some later arrival at the same content — a
          // redo, most likely — and leave the controls showing what was undone.
          const content = canonicalize(next);
          written = content === canonicalize(current) ? null : content;
          return next;
        });
        // Recorded only once the session has accepted the write, so that the
        // draft arriving at exactly this content does not read as something
        // moving under the form: it IS the form. A refused write moves
        // nothing, and its marker would be spent later on an unrelated
        // arrival, leaving the controls showing a draft that had moved on.
        flushed.current = written;
        await controller.finish();
        // The save landed, so whatever a list write was refused before it is
        // no longer what happened to this stage.
        clearRefusedWrite();
        return { success: true };
      } catch (error) {
        flushed.current = null;
        return {
          success: false,
          formErrors:
            error instanceof InvalidProtocolDraftError
              ? error.issues.map((issue) => issue.message)
              : error instanceof SessionReadOnlyError
                ? [READ_ONLY_MESSAGE]
                : [failureMessage(error)],
        };
      }
    },
    [clearRefusedWrite, controller, flushed, readOnly, storeApi],
  );

  /**
   * The other way this form writes to the session: structurally, as a list
   * editor commits one row operation, rather than as a whole-draft flush.
   *
   * It leaves the same marker a submit does, and for the same reason — an
   * arrival from ELSEWHERE re-seeds the controls, and a write the form made
   * itself is not that. Left unmarked, adding a row would write the draft back
   * over every control on screen, discarding everything typed since and
   * resetting the row dialog that issued the write.
   */
  const applyOwnCommands = useCallback(
    (commands: readonly Command[]): OwnCommandsResult => {
      // An empty batch is how a list editor READS the draft the session holds
      // right now — which is the point of asking rather than reading the
      // snapshot it rendered against — so it must leave no marker at all. One
      // left here would suppress the re-seed for a change that arrived from
      // somewhere else entirely. It is also how the draft is read back when
      // there is nothing to write: it dispatches nothing, so it cannot be
      // refused.
      const before = controller.applyCommands([]);
      if (commands.length === 0) return { draft: before, refused: false };
      // A stage already known to be read-only when this handler was built. The
      // write never reaches the session, so it is a refusal like the caught one
      // below — said the same way, and SAID, so a caller cannot have to know
      // which of the two it met. Reachable only while every control the write
      // could come from is disabled, which is a reason to keep the two branches
      // identical rather than a reason to let one of them stay quiet: the
      // difference between them is where the lease went, and that is not
      // something the researcher is being asked about.
      if (readOnly) {
        reportRefusedWrite(READ_ONLY_MESSAGE);
        return { draft: before, refused: true };
      }

      let next: StageFormDraft;
      try {
        next = controller.applyCommands(commands);
      } catch (error) {
        // Access can be revoked between the render this handler was built in
        // and the click that runs it, and the session refuses a write from a
        // lease it no longer holds by throwing — out of an event handler,
        // where an uncaught throw is a crash rather than a declined edit. It
        // is the same ordinary lease transition the submit reports, so it is
        // reported the same way and in the same words.
        //
        // Everything else is re-thrown deliberately. A caller reads the draft
        // through this very function and dispatches in the same turn, so an
        // `ApplyError` — a key that is not the list the command addresses, an
        // index out of range — says the form asked for something its own
        // snapshot ruled out. Reporting that as a declined edit would leave
        // the researcher clicking a button that quietly does nothing; see
        // `readArray` in `useArrayFieldCommands` for the rule that keeps a
        // list command applicable.
        if (!(error instanceof SessionReadOnlyError)) throw error;
        reportRefusedWrite(READ_ONLY_MESSAGE);
        return { draft: before, refused: true };
      }

      // The session took these commands, which is the only thing that can say
      // a refusal reported before them is no longer this form's news.
      clearRefusedWrite();

      const content = canonicalize(next);
      const started = canonicalize(before);
      // What the form believes the agreed draft is: what it last saw agreed,
      // or what it itself last wrote and is still waiting to see arrive.
      const expected = flushed.current ?? canonicalize(committedFields);
      // Marked only when this write is the ONLY thing that has moved the draft
      // since. The marker says "an arrival at this content is the form's own
      // doing"; when something else moved the draft first and the controls
      // have not seen it yet, the arrival is that change AND this one, and
      // claiming it would strand the other half on screen — to be written back
      // over the top by the next save. A write that changes nothing has no
      // transition to explain either, and a marker for one that never happens
      // stays standing to be spent on some later arrival at the same content.
      if (content !== started && started === expected)
        flushed.current = content;
      return { draft: next, refused: false };
    },
    [
      clearRefusedWrite,
      committedFields,
      controller,
      flushed,
      readOnly,
      reportRefusedWrite,
    ],
  );

  const { formProps, formErrors } = useForm({
    onSubmit: handleSubmit,
    onSubmitInvalid: (errors) => {
      // Scoped to this form's own markup: an item dialog open over the editor
      // renders the same field names, and an unscoped search can hand this
      // form's failed submit a control belonging to the dialog above it.
      focusFirstError(errors, formRef.current);
    },
  });

  // A refused structural write is reported beside whatever the last submit had
  // to say, in one region, because they are the same kind of news about the
  // same form. `undefined` rather than an empty list: the region is not
  // rendered at all when there is nothing to report.
  const reportedErrors = useMemo(() => {
    if (refusedWrite === undefined) return formErrors;
    return [...(formErrors ?? []), refusedWrite];
  }, [formErrors, refusedWrite]);

  /**
   * What the session says is wrong with the stage, handed to the outline so
   * the section that owns each problem can say so.
   *
   * The outline is otherwise built from the form's own field errors, which are
   * the rules a control can state about itself. These are the other kind: a
   * reference to a resource the protocol does not have, a subject naming a
   * type a collaborator has deleted, a rule the schema states about the stage
   * as a whole. Every control involved is holding a value it is perfectly
   * happy with, so without this the save is refused with a message while every
   * section on the page reads "Finished".
   */
  useEffect(() => {
    outline.setValidationIssues(
      stageIssuesOf(snapshot.validation, snapshot.editedSection.sectionId),
    );
  }, [outline, snapshot.editedSection.sectionId, snapshot.validation]);

  // The outline lists the sections in the order they appear on the page, and
  // nothing tells it when that order changes: a component reordering sections
  // from its own state re-renders itself, not the outline beside it. Watching
  // the form's own subtree is what closes that gap.
  useEffect(() => {
    const form = formRef.current;
    if (form === null) return;
    const observer = new MutationObserver(() => outline.revalidateOrder());
    observer.observe(form, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [outline]);

  const layoutGroupId = useId();
  const context = useMemo(
    () =>
      storeApi === undefined
        ? null
        : {
            formId,
            controller,
            storeApi,
            committedFields,
            applyOwnCommands,
            reportRefusedWrite,
            identity: snapshot.editedSection.identity,
            creation: snapshot.editedSection.creation,
            protocolContext: snapshot.protocolContext,
            readOnly,
            outline,
          },
    [
      applyOwnCommands,
      committedFields,
      controller,
      formId,
      outline,
      readOnly,
      reportRefusedWrite,
      snapshot.editedSection.creation,
      snapshot.editedSection.identity,
      snapshot.protocolContext,
      storeApi,
    ],
  );

  if (context === null) return null;

  return (
    <StageEditorFormContext value={context}>
      <ResourceGatewayProvider gateway={controller.resourceGateway}>
        <div className={cx('@container flex w-full flex-col gap-6', className)}>
          <div className="grid grid-cols-1 gap-6 @min-[60rem]:grid-cols-[16rem_minmax(0,1fr)] @min-[60rem]:gap-10">
            <SectionOutline />
            <form
              id={formId}
              ref={formRef}
              noValidate // The form reports its own problems; the browser's differ.
              onSubmit={formProps.onSubmit}
              className="flex min-w-0 flex-col"
            >
              <LayoutGroup id={layoutGroupId}>
                {reportedErrors && (
                  <FormErrorsList key="form-errors" errors={reportedErrors} />
                )}
                {children}
              </LayoutGroup>
            </form>
          </div>
          {actions?.({ controller, formId, readOnly })}
        </div>
      </ResourceGatewayProvider>
    </StageEditorFormContext>
  );
}

/**
 * The session's validation issues that belong to the stage being edited, as
 * paths INSIDE that stage.
 *
 * The session attributes every issue to the protocol section that owns it, so
 * the ones about other sections — a codebook entity's own definition, the
 * protocol's settings — are not this editor's to point at. What is left is
 * addressed from the whole protocol (`stages`, then the stage's position in
 * the interview), and the outline knows only the stage document, so those two
 * segments are dropped.
 */
function stageIssuesOf(
  validation: ProtocolBuilderSnapshot['validation'],
  stageSectionId: ProtocolBuilderSnapshot['editedSection']['sectionId'],
): SectionValidationIssue[] {
  if (validation.status !== 'invalid') return [];
  return validation.issues.flatMap((issue) => {
    if (issue.sectionId !== stageSectionId) return [];
    const [root, position, ...inside] = issue.path;
    if (root !== 'stages' || typeof position !== 'number') return [];
    if (inside.length === 0) return [];
    return [{ path: inside, message: issue.message }];
  });
}

type CommittedDraft = Readonly<{
  fields: StageFormDraft;
  /** Bumped each time the agreed draft is replaced by a different one. */
  generation: number;
}>;

/**
 * The draft the controls were built from, and a count of how often it has been
 * replaced beneath them.
 *
 * Typing never reaches the session, so the draft moves for exactly two kinds
 * of reason: this form flushing its own values on submit, and everything else
 * — undo, redo, an acknowledgement, an authoritative replacement, a rollback
 * after a lost lease. Only the second kind is a surprise to the controls on
 * screen, and only it advances the generation that asks for a re-seed.
 *
 * The distinction has to be made here rather than from `pendingCommands`,
 * which cannot tell an undo from a submit: both leave a batch outstanding. A
 * form left mounted through an undo goes on showing the value that was just
 * undone, and writes it back over the undo when saved.
 *
 * Compared by content, not identity: the session freezes a fresh object into
 * every snapshot, and one lands whenever validation settles.
 */
function useCommittedFields(
  snapshot: ProtocolBuilderSnapshot,
  flushed: RefObject<string | null>,
): CommittedDraft {
  const { fields } = snapshot.editedSection;
  const committed = useRef<CommittedDraft>({ fields, generation: 0 });
  const seen = useRef(canonicalize(fields));
  const content = canonicalize(fields);

  if (content !== seen.current) {
    seen.current = content;
    // The marker describes ONE write, and is spent by the FIRST transition
    // this hook observes after it was left — whatever content that transition
    // arrived at, and whether or not it is the one the marker names.
    //
    // Matching it says the arrival is the write, and the controls already show
    // it. Not matching it says something else moved the draft too, and this
    // render is showing that as well as the write: the controls have to be
    // re-seeded for it, and the marker has nothing left to explain, because
    // the transition it was about has now happened — inside this one. It is
    // therefore cleared on BOTH answers rather than only on a match.
    //
    // Left standing on a mismatch it is not a marker any more, only a content
    // that will one day come round again: `useSyncExternalStore` hands a render
    // whatever the store holds at render time rather than every value it passed
    // through, so a write and an acknowledgement landing in the same commit are
    // one render showing the two together, and the write's own content is never
    // seen. The next arrival AT that content — a collaborator withdrawing the
    // change that had combined with it, an undo, a redo — would then read as
    // this form's own doing, the re-seed it needed would be skipped, and the
    // controls would keep values nobody agrees to for the next save to write
    // back over the top.
    const ownFlush = content === flushed.current;
    flushed.current = null;
    committed.current = {
      fields,
      generation: committed.current.generation + (ownFlush ? 0 : 1),
    };
  } else {
    // A marker that describes no transition, thrown away here because this is
    // the only place that can see it. A write leaves the marker, and the
    // transition it explains retires it — but if something else moves the
    // draft back within the same commit (a write and the undo of it, a submit
    // and the rollback that followed), no transition is ever observed and the
    // marker outlives what it was about. Left standing, it is spent on the
    // next arrival AT that content — the redo — so the controls keep the
    // undone values and write them back over it.
    //
    // Expired by content rather than by a sequence number handed back from the
    // write, because a sequence number only answers this question if it counts
    // EVERY move of the draft, which is exactly the moves this hook cannot see
    // and the session would have to count for it. This hook already renders on
    // every snapshot and already canonicalises the draft to notice a
    // transition at all, so "no transition happened" is a reading it has for
    // free.
    flushed.current = null;
  }
  return committed.current;
}

const READ_ONLY_MESSAGE =
  'This stage is read-only, so your changes were not saved. Take over editing and try again.';

const UNAVAILABLE_MESSAGE =
  'This stage could not be saved because its form is no longer available. Reopen the stage and try again.';

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'This stage could not be saved. Wait a moment and try again.';
}
