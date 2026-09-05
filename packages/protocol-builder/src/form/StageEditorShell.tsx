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

import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
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
import type { ObjectPath } from '@codaco/fresco-ui/form/utils/objectPath';
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
import { SectionOutlineStore } from './outlineStore.ts';
import { reseedStageForm } from './reseedStageForm.ts';
import SectionOutline from './SectionOutline.tsx';
import {
  type DormantField,
  stageDraftFromSubmission,
} from './stageDraftFromSubmission.ts';
import {
  StageEditorFormContext,
  type StageFormStoreApi,
} from './stageEditorContext.ts';

/**
 * What a host needs to render its own action chrome for the editor.
 *
 * The package owns the form and knows whether it can be submitted; the host
 * owns where the buttons live and what else sits beside them. `formId` is the
 * whole contract for a submit control rendered outside the form element.
 */
export type StageEditorActionContext = Readonly<{
  controller: StageEditorController;
  formId: string;
  readOnly: boolean;
}>;

export type StageEditorShellProps = Readonly<{
  controller: StageEditorController;
  /** The host's action chrome. Receives the controller and the form id. */
  actions?: (context: StageEditorActionContext) => ReactNode;
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
   * Cleared once the stage is editable again, because taking editing back is
   * exactly what the message asks for and the researcher should not have to
   * read it twice.
   */
  const [refusedWrite, setRefusedWrite] = useState<string | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!readOnly) setRefusedWrite(undefined);
  }, [readOnly]);

  /**
   * The draft moved for a reason that is not this form's own submit, so the
   * controls on screen are showing something that is no longer agreed. They
   * are written to rather than rebuilt: rebuilding would discard everything
   * typed but not yet saved and destroy any row dialog open over the editor —
   * along with the draft inside it, and the message a save in flight was about
   * to report. See `reseedStageForm`.
   */
  const reseededGeneration = useRef(committed.generation);
  useEffect(() => {
    if (storeApi === undefined) return;
    if (reseededGeneration.current === committed.generation) return;
    reseededGeneration.current = committed.generation;
    reseedStageForm(storeApi, committed.fields);
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
    [controller, flushed, readOnly, storeApi],
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
    (commands: readonly Command[]): StageFormDraft => {
      // An empty batch is how a list editor READS the draft the session holds
      // right now — which is the point of asking rather than reading the
      // snapshot it rendered against — so it must leave no marker at all. One
      // left here would suppress the re-seed for a change that arrived from
      // somewhere else entirely. It is also how the draft is read back when
      // there is nothing to write: it dispatches nothing, so it cannot be
      // refused.
      const before = controller.applyCommands([]);
      if (readOnly || commands.length === 0) return before;

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
        if (!(error instanceof SessionReadOnlyError)) throw error;
        setRefusedWrite(READ_ONLY_MESSAGE);
        return before;
      }

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
      return next;
    },
    [committedFields, controller, flushed, readOnly],
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
            identity: snapshot.editedSection.identity,
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
      snapshot.editedSection.identity,
      snapshot.protocolContext,
      storeApi,
    ],
  );

  if (context === null) return null;

  return (
    <StageEditorFormContext value={context}>
      <WithResourceGateway gateway={controller.resourceGateway}>
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
      </WithResourceGateway>
    </StageEditorFormContext>
  );
}

/**
 * Puts the session's resource gateway where the editor's resource pickers look
 * for it, and nowhere else: a session opened without one renders the same tree,
 * and a picker mounted inside it says so rather than reaching for host storage.
 */
function WithResourceGateway({
  gateway,
  children,
}: Readonly<{
  gateway: StageEditorController['resourceGateway'];
  children: ReactNode;
}>) {
  if (gateway === undefined) return children;
  return (
    <ResourceGatewayProvider gateway={gateway}>
      {children}
    </ResourceGatewayProvider>
  );
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
    // The marker describes ONE write, and is spent by the transition it
    // explains. Undo and then redo returns the draft to that same content, and
    // by then the controls are showing the undone values — a marker left
    // standing would leave them there, to be saved back over the redo.
    const ownFlush = content === flushed.current;
    if (ownFlush) flushed.current = null;
    committed.current = {
      fields,
      generation: committed.current.generation + (ownFlush ? 0 : 1),
    };
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

/**
 * Every field the form is holding but not showing, as the store parked it.
 *
 * The submitted values cover only mounted fields, so without this a value
 * hidden behind a collapsed group would look identical to one that was
 * deliberately thrown away.
 */
/**
 * Where every field the form still has mounted lives.
 *
 * The submitted values are assembled from these, so a hidden container that
 * encloses one of them must not be replayed over the top of what they hold.
 */
function mountedPathsOf(storeApi: StageFormStoreApi): ObjectPath[] {
  return [...storeApi.getState().fields].map(
    ([name, field]) => field.path ?? resolveFieldPath([], name),
  );
}

function dormantFieldsOf(storeApi: StageFormStoreApi): DormantField[] {
  return [...storeApi.getState().dormantValues].map(([name, field]) => ({
    name,
    ...(field.path === undefined ? {} : { path: field.path }),
    value: field.value,
  }));
}
