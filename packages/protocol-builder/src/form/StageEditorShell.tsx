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
      if (readOnly) return controller.snapshot.editedSection.fields;
      // An empty batch is how a list editor READS the draft the session holds
      // right now — which is the point of asking rather than reading the
      // snapshot it rendered against — so it must leave no marker at all. One
      // left here would suppress the re-seed for a change that arrived from
      // somewhere else entirely.
      const next = controller.applyCommands(commands);
      if (commands.length === 0) return next;
      const content = canonicalize(next);
      // Marked only when the draft actually moved, matching the submit's own
      // rule: a marker for a transition that never happens stays standing, and
      // is then spent on some later arrival at the same content.
      if (content !== canonicalize(committedFields)) flushed.current = content;
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
              {formErrors && (
                <FormErrorsList key="form-errors" errors={formErrors} />
              )}
              {children}
            </LayoutGroup>
          </form>
        </div>
        {actions?.({ controller, formId, readOnly })}
      </div>
    </StageEditorFormContext>
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
