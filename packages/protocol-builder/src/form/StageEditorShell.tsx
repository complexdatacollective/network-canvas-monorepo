import { LayoutGroup } from 'motion/react';
import {
  type ReactNode,
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
  type DormantField,
  stageDraftFromSubmission,
} from './stageDraftFromSubmission.ts';
import {
  StageEditorFormContext,
  type StageFormStoreApi,
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
  // Which arrivals this form itself caused is the controller's own record —
  // every write goes through it, whichever reference to it a section holds.
  // Everything else that moves the draft — undo, redo, an acknowledgement, an
  // authoritative replacement — moved it out from under the controls on
  // screen.
  const committed = useCommittedFields(props.controller);

  return (
    <FormStoreProvider key={`${identity.type}:${identity.id}`}>
      <StageEditorFormBody {...props} committed={committed} />
    </FormStoreProvider>
  );
}

function StageEditorFormBody({
  controller,
  actions,
  children,
  className,
  committed,
}: StageEditorShellProps &
  Readonly<{
    committed: CommittedDraft;
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

      try {
        // Inside the guarded block with the finish it precedes: access can be
        // revoked between the render that read it and this submit, and the
        // session refuses a write from a lease it no longer holds. That is an
        // ordinary lease transition, and it belongs in the form's own errors
        // rather than in a rejected submit promise.
        //
        // The controller records the draft this produces as the form's own,
        // and only once the session has accepted it, so the arrival at exactly
        // this content does not read as something moving under the form: it IS
        // the form. A submit that changes nothing records nothing.
        controller.changeFields((current) =>
          stageDraftFromSubmission({
            currentFields: current,
            submittedValues: values as Record<string, FieldValue>,
            mountedPaths: mountedPathsOf(storeApi),
            dormantFields: dormantFieldsOf(storeApi),
          }),
        );
        await controller.finish();
        return { success: true };
      } catch (error) {
        controller.forgetOwnWrite();
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
    [controller, readOnly, storeApi],
  );

  /**
   * The other way this form writes to the session: structurally, as a list
   * editor commits one row operation, rather than as a whole-draft flush.
   *
   * The controller records it as the form's own, exactly as it does a submit,
   * and for the same reason — an arrival from ELSEWHERE re-seeds the controls,
   * and a write the form made itself is not that. Unrecorded, adding a row
   * would write the draft back over every control on screen, discarding
   * everything typed since and resetting the row dialog that issued the write.
   *
   * What is left here is the one thing the controller cannot say: a session
   * that has stopped accepting writes refuses one by throwing, which would
   * take the editor down rather than decline the edit, so a list editor is
   * answered with the draft as it stands.
   */
  const applyOwnCommands = useCallback(
    (commands: readonly Command[]): StageFormDraft => {
      if (readOnly) return controller.snapshot.editedSection.fields;
      return controller.applyCommands(commands);
    },
    [controller, readOnly],
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
      snapshot.editedSection.creation,
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
                {formErrors && (
                  <FormErrorsList key="form-errors" errors={formErrors} />
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
 * of reason: this form writing through its controller — a submit, a row
 * operation, a reset a choice triggered — and everything else: undo, redo, an
 * acknowledgement, an authoritative replacement, a rollback after a lost
 * lease. Only the second kind is a surprise to the controls on screen, and
 * only it advances the generation that asks for a re-seed.
 *
 * Which kind it was is the controller's to say, because the controller is what
 * every write goes through. The distinction cannot be made from
 * `pendingCommands`, which cannot tell an undo from a submit: both leave a
 * batch outstanding. A form left mounted through an undo goes on showing the
 * value that was just undone, and writes it back over the undo when saved.
 *
 * Compared by content, not identity: the session freezes a fresh object into
 * every snapshot, and one lands whenever validation settles.
 */
function useCommittedFields(controller: StageEditorController): CommittedDraft {
  const { fields } = controller.snapshot.editedSection;
  const committed = useRef<CommittedDraft>({ fields, generation: 0 });
  const seen = useRef(canonicalize(fields));
  const content = canonicalize(fields);

  if (content !== seen.current) {
    seen.current = content;
    const ownWrite = controller.takeOwnWrite(content);
    committed.current = {
      fields,
      generation: committed.current.generation + (ownWrite ? 0 : 1),
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
