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

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { FieldsDisabled } from '@codaco/fresco-ui/form/FieldsDisabled';
import FormErrorsList from '@codaco/fresco-ui/form/FormErrors';
import { useForm } from '@codaco/fresco-ui/form/hooks/useForm';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmitHandler,
} from '@codaco/fresco-ui/form/store/types';
import { focusFirstError } from '@codaco/fresco-ui/form/utils/focusFirstError';
import { getValue } from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import {
  EnclosingHeadingLevel,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { stageSchema } from '@codaco/protocol-validation';
import { applyCommands, type Command } from '@codaco/studio-sync/apply';

import type {
  StageEditorActions,
  StageSection,
} from '../stage-editor-contract.ts';
import {
  stageDocument,
  type StageFormDraft,
  type StageIdentity,
} from '../stageDocument.ts';
import { NOT_READY_MESSAGE, useStageEdit } from '../stageEdit.tsx';
import {
  dormantFieldsOf,
  mountedPathsOf,
  documentFromSubmission,
} from './documentFromSubmission.ts';
import {
  SectionOutlineStore,
  type SectionValidationIssue,
} from './outlineStore.ts';
import { READ_ONLY_MESSAGE } from './readOnlyRefusal.ts';
import {
  type OwnCommandsResult,
  StageEditorFormContext,
} from './stageEditorContext.ts';
import { createStageSectionsStore } from './stageSections.ts';

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
  /** The host's action chrome. Receives the form id and whether it may write. */
  actions?: StageEditorActions;
  children: ReactNode;
  className?: string;
}>;

/**
 * The one form every stage editor is built inside.
 *
 * Every named editor composes sections into this shell, and the shell owns
 * everything a stage editor does regardless of which stage it is editing: one
 * form store holding the whole document, the register of which sections are
 * mounted and how each one stands, the submit that hands the document back,
 * and a slot where the host puts its own buttons.
 *
 * The store is keyed by the stage and by how many drafts have been discarded,
 * because Fresco forms have no reinitialise: opening a different stage is a
 * different form, and so is starting again from the protocol's own version
 * after a save the host refused.
 */
export default function StageEditorShell(props: StageEditorShellProps) {
  const { identity, committedFields, access } = useStageEdit();
  const intl = useAppIntl();
  const [discarded, setDiscarded] = useState(0);
  const [lostMessage, setLostMessage] = useState<string | undefined>(undefined);

  const discardDraft = useCallback((message: string) => {
    setLostMessage(message);
    setDiscarded((count) => count + 1);
  }, []);

  // A stage the protocol will not open is the one case that has to be said
  // rather than waited out: the document is never arriving, so a form waiting
  // for it is a page that never finishes opening.
  if (access === 'unavailable') {
    return (
      <Alert variant="destructive">
        {intl.formatMessage(messages.stageUnavailable)}
      </Alert>
    );
  }

  // Nothing is drawn until the host has handed the stage over. A form built
  // from a document that has not arrived would seed every field from nothing
  // and then have to be written over.
  if (identity === undefined || committedFields === undefined) return null;

  return (
    <StageDocument
      key={`${identity.type}:${identity.id}:${discarded}`}
      committedFields={committedFields}
    >
      {(document, working, setDocument) => (
        <StageEditorFormBody
          {...props}
          identity={identity}
          document={document}
          working={working}
          setDocument={setDocument}
          lostMessage={lostMessage}
          discardDraft={discardDraft}
        />
      )}
    </StageDocument>
  );
}

/**
 * The document the form is editing, held above the form store so the store can
 * be handed it.
 *
 * A structural write — a row inserted, a capability switched off — reaches
 * paths no control is registered at, and the form has nowhere to keep those.
 * Seeded from what the lock handed over and advanced by every such write; a
 * submit replays the form's own values over it. Every field with no starting
 * value of its own is seeded from this, which is why the form store is given
 * it rather than each field being handed its own.
 *
 * Held twice on purpose. The ref is what a write reads and writes, because a
 * second write in the same turn has to see the first. The state is what
 * everything under the form reads, because a control that mounts AFTER a write
 * seeds itself from this document — a list revealed by a group being opened, a
 * field inside a capability switched back on — and a value that had not moved
 * would put back what the write threw away.
 *
 * Keyed by the caller, so opening a different stage — or starting again from
 * the protocol's own version after a save the host refused — is a different
 * document and a different form store, which Fresco has no reinitialise for.
 */
function StageDocument({
  committedFields,
  children,
}: Readonly<{
  committedFields: StageFormDraft;
  children: (
    document: StageFormDraft,
    working: RefObject<StageFormDraft>,
    setDocument: (fields: StageFormDraft) => void,
  ) => ReactNode;
}>) {
  const working = useRef<StageFormDraft>(committedFields);
  const [document, setDocument] = useState<StageFormDraft>(committedFields);

  return (
    <FormStoreProvider initialValues={document}>
      {children(document, working, setDocument)}
    </FormStoreProvider>
  );
}

function StageEditorFormBody({
  actions,
  children,
  className,
  identity,
  document,
  working,
  setDocument,
  lostMessage,
  discardDraft,
}: StageEditorShellProps &
  Readonly<{
    identity: StageIdentity;
    document: StageFormDraft;
    working: RefObject<StageFormDraft>;
    setDocument: (fields: StageFormDraft) => void;
    lostMessage: string | undefined;
    discardDraft: (message: string) => void;
  }>) {
  const { formId, access, holder, creation, save } = useStageEdit();
  // Everything below the shell asks one question — may this write? — and a
  // stage the host has not granted yet answers it exactly as one somebody else
  // holds does. What differs is what is SAID about it, and that is decided
  // here: only a held stage has a holder to name, and only a stage still
  // opening is worth trying again in a moment.
  const readOnly = access !== 'editing';
  const writeRefusal =
    access === 'readOnly' ? READ_ONLY_MESSAGE : NOT_READY_MESSAGE;
  const intl = useAppIntl();
  const storeApi = useContext(FormStoreContext);
  const formRef = useRef<HTMLFormElement>(null);
  const outline = useMemo(() => new SectionOutlineStore(), []);
  // Beside the registry rather than derived from it on every render: a host
  // reads this with `useSyncExternalStore`, which re-subscribes whenever the
  // store's identity moves, and a new store per render would tear its list
  // down and build it again on every keystroke.
  const sections = useMemo(
    () =>
      storeApi === undefined
        ? undefined
        : createStageSectionsStore(outline, storeApi),
    [outline, storeApi],
  );

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
   * `applyOwnCommands` names the refusal it can see for itself — the editor
   * being read-only — and a list editor names the ones it cannot: a batch the
   * list decided not to issue, because the row it named is gone or cannot be
   * told from the rows beside it, reaches this form as nothing at all.
   */
  const reportRefusedWrite = useCallback((message: string) => {
    setRefusedWrite(message);
  }, []);

  /**
   * The document right now: what the controls hold, over what has been written.
   *
   * The values come from the form's own `getFormValues`, which is what a
   * submit is handed — and it has to be, because `documentFromSubmission`
   * reads them by field PATH. Assembled here by field NAME instead, every
   * control registered beneath a top-level key (`form.title`, `form.fields`)
   * looked to that read like a field the submission never carried, and was
   * skipped: this answered with the committed document wherever a section
   * writes into a nested part of the stage, so a host reading it saw a
   * researcher's unsaved form as no change at all.
   */
  const liveDraft = useCallback((): StageFormDraft => {
    if (storeApi === undefined) return working.current;
    return documentFromSubmission({
      currentFields: working.current,
      submittedValues: storeApi.getState().getFormValues(),
      mountedPaths: mountedPathsOf(storeApi),
      dormantFields: dormantFieldsOf(storeApi),
    });
  }, [storeApi]);

  /**
   * How this form writes structurally, as a list editor commits one row
   * operation rather than as a researcher types into a control.
   *
   * There is no host in it: the editor owns the section while it holds the
   * lock, so the batch is applied to the document the form is holding and the
   * result handed straight back. An empty batch is how a caller READS that
   * document, so it writes nothing and can never be refused.
   */
  const applyOwnCommands = useCallback(
    (commands: readonly Command[]): OwnCommandsResult => {
      const before = liveDraft();
      if (commands.length === 0) return { draft: before, refused: false };
      if (readOnly) {
        reportRefusedWrite(writeRefusal);
        return { draft: before, refused: true };
      }
      const next = applyCommands(before, [...commands]);
      working.current = next;
      setDocument(next);
      clearRefusedWrite();
      return { draft: next, refused: false };
    },
    [clearRefusedWrite, liveDraft, readOnly, reportRefusedWrite, writeRefusal],
  );

  const handleSubmit = useCallback<FormSubmitHandler>(
    async (values) => {
      // The store and the sections resolved against it stand or fall together
      // — the second is made from the first — and neither outliving the form
      // it belongs to is the same news: there are no values left to save.
      if (storeApi === undefined || sections === undefined) {
        return { success: false, formErrors: [UNAVAILABLE_MESSAGE] };
      }
      if (readOnly) {
        return { success: false, formErrors: [writeRefusal] };
      }

      const fields = documentFromSubmission({
        currentFields: working.current,
        submittedValues: values as Record<string, FieldValue>,
        mountedPaths: mountedPathsOf(storeApi),
        dormantFields: dormantFieldsOf(storeApi),
      });
      working.current = fields;

      // The schema's own reading of the stage, for the researcher's benefit.
      // Every sentence it can produce is read out above the form, because
      // that list is the one thing every host renders: an anchored problem
      // published only to the sections seam reaches a researcher in Architect,
      // which draws a section list, and nowhere at all in a host that draws
      // none — a save refused with nothing on screen saying why.
      //
      // The anchored ones are still published to the seam as well. There they
      // are what marks a section and what a row of the list is read out with;
      // here they are the account of the refusal, named by the section that
      // answers for each, in the order the sections sit on the page. The rest
      // are about the stage as a whole and have no section to name, so they
      // are said in the schema's own words after them.
      const { sections: anchored, whole } = stageProblems(identity, fields);
      outline.setValidationIssues(anchored);
      if (anchored.length > 0 || whole.length > 0) {
        const said = [...sectionProblems(sections.getSnapshot()), ...whole];
        // The generic refusal only where the editor has nothing more precise
        // to say — every anchored problem claimed by a field that is already
        // stating it beside itself, which is two accounts of one fault.
        return {
          success: false,
          formErrors: said.length > 0 ? said : [INVALID_STAGE_MESSAGE],
        };
      }

      const outcome = await save(fields);
      if (outcome.status === 'saved') {
        // A save is the only thing that may move the baselines the form's
        // dirty flag is measured against, and Studio's discard prompt reads
        // that flag. A structural write and a refused save both advance the
        // working document out of values nobody has stored, so a baseline
        // taking those would let a researcher leave without being asked,
        // losing work the editor was still showing them. (A field remounting
        // after one seeds itself from the working document, as ever.)
        setDocument(fields);
        storeApi.getState().rebaseToDocument(fields);
        clearRefusedWrite();
        return { success: true };
      }
      if (outcome.status === 'lost') {
        // Nothing is retried and nothing is re-acquired: the section belongs to
        // somebody else now, so what is on screen is a draft of a document this
        // editor may no longer write. It goes, and the form starts again from
        // what the protocol holds.
        discardDraft(outcome.message);
        return { success: false, formErrors: [outcome.message] };
      }
      return { success: false, formErrors: [outcome.message] };
    },
    [
      clearRefusedWrite,
      discardDraft,
      identity,
      outline,
      readOnly,
      save,
      sections,
      storeApi,
      writeRefusal,
    ],
  );

  /**
   * Whether a save is in flight, worn by the FORM.
   *
   * The package's own `SubmitButton` already says this about itself, but a
   * host need not use it: `formId` is the whole contract for a submit control
   * rendered outside the form, and a plain `<button form={formId}>` is a
   * conforming host. So the fact that the form is busy has to be readable from
   * the form itself.
   */
  const isSubmitting = useFormStore((state) => state.isSubmitting);

  const { formProps, formErrors } = useForm({
    onSubmit: handleSubmit,
    onSubmitInvalid: (errors) => {
      // Scoped to this form's own markup: an item dialog open over the editor
      // renders the same field names, and an unscoped search can hand this
      // form's failed submit a control belonging to the dialog above it.
      focusFirstError(errors, formRef.current);
    },
  });

  // A refused structural write, and the draft a refused save discarded, are
  // reported beside whatever the last submit had to say: they are the same
  // kind of news about the same form. `undefined` rather than an empty list —
  // the region is not rendered at all when there is nothing to report.
  const reportedErrors = useMemo(() => {
    const extra = [refusedWrite, lostMessage].filter(
      (message): message is string => message !== undefined,
    );
    if (extra.length === 0) return formErrors;
    return [...(formErrors ?? []), ...extra];
  }, [formErrors, lostMessage, refusedWrite]);

  // The outline reads the sections and their fields off the page, and nothing
  // tells it when either changes: a component reordering its sections, or
  // revealing a field, re-renders itself and not the outline beside it.
  // Watching the form's own subtree is what closes that gap — text included,
  // because a field's label is what the outline calls it in a problem, and
  // `aria-invalid`, because a control that decides its own validity against
  // the rest of the protocol can flip it without anything else on the page
  // moving.
  useEffect(() => {
    const form = formRef.current;
    if (form === null) return;
    const observer = new MutationObserver(() => outline.revalidate());
    observer.observe(form, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-invalid'],
    });
    return () => observer.disconnect();
  }, [outline]);

  /**
   * The level of the stage's own name, which every editor wears as the page's
   * heading and which everything else in the form is a subsection of.
   *
   * Stated rather than left to Surface depth, which is a fact about how deep
   * the card sits rather than about the outline. A host that says what it
   * encloses pushes the whole ladder down: the title one below the host's
   * heading, each section one below the title.
   */
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const stageTitleLevel =
    enclosingHeadingLevel === null
      ? 'h2'
      : headingTagBelow(enclosingHeadingLevel);

  const layoutGroupId = useId();
  const context = useMemo(
    () =>
      storeApi === undefined
        ? null
        : {
            formId,
            storeApi,
            committedFields: document,
            liveDraft,
            applyOwnCommands,
            reportRefusedWrite,
            identity,
            creation,
            readOnly,
            outline,
          },
    [
      applyOwnCommands,
      creation,
      document,
      formId,
      identity,
      liveDraft,
      outline,
      readOnly,
      reportRefusedWrite,
      storeApi,
    ],
  );

  if (context === null || sections === undefined) return null;

  return (
    <StageEditorFormContext value={context}>
      <div className={cx('@container flex w-full flex-col', className)}>
        {/*
          One column, at the width and with the gutters Architect's stage
          editor has always had. A host that wants a list of the sections
          beside the form renders it in its own chrome, out of `sections` on
          the action slot; this package draws no list of its own.

          `@container` stays on the element above rather than here, so a
          section asking about the space it has is answered about the room the
          host gave the editor and not about this column's own cap.
        */}
        <div className="phone-landscape:px-6 mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
          <form
            id={formId}
            ref={formRef}
            noValidate // The form reports its own problems; the browser's differ.
            aria-busy={isSubmitting}
            onSubmit={formProps.onSubmit}
            className="flex min-w-0 flex-col"
          >
            <LayoutGroup id={layoutGroupId}>
              <EnclosingHeadingLevel level={stageTitleLevel}>
                {access === 'readOnly' && (
                  <Alert variant="info" density="compact">
                    {holder === undefined
                      ? intl.formatMessage(messages.heldByNobodyNamed)
                      : intl.formatMessage(messages.heldBy, {
                          holder: holder.displayName,
                        })}
                  </Alert>
                )}
                {reportedErrors && (
                  <FormErrorsList key="form-errors" errors={reportedErrors} />
                )}
                {/*
                  Said once by the form rather than by every control: being
                  unable to write is a property of the edit, not of any one
                  field, so no section has to remember to pass it down.
                */}
                <FieldsDisabled disabled={readOnly}>{children}</FieldsDisabled>
              </EnclosingHeadingLevel>
            </LayoutGroup>
          </form>
          {actions?.({ formId, readOnly, sections })}
        </div>
      </div>
    </StageEditorFormContext>
  );
}

/**
 * The anchored refusals as sentences for the form's own error list, each named
 * by the section that answers for it.
 *
 * Read from the published sections rather than from the issues themselves, so
 * there is one resolution of what is wrong and who answers for it: what this
 * says and what a host's section list says cannot come apart, and a problem a
 * control is already stating beside itself is left to that control in both.
 *
 * Encoded rather than formatted, like every other refusal the form carries:
 * these are handed to `useForm` as `formErrors` and rendered by `FormErrors`,
 * which decodes them where they are read, so a refusal already on screen
 * follows a change of language. The sentence inside is encoded too — or is a
 * plain one the protocol schema wrote about a named thing, which the same
 * route passes through untouched.
 */
function sectionProblems(sections: readonly StageSection[]): string[] {
  return sections.flatMap((section) =>
    section.problems.map((problem) =>
      createMessageError(messages.sectionProblem, {
        sectionTitle: section.title,
        problem: { messageError: problem },
      }),
    ),
  );
}

/**
 * What the schema says is wrong with the stage, split by whether a section can
 * answer for it.
 *
 * A problem anchored at a path belongs to whichever section owns that path, so
 * it can be named by that section — above the form, and in a host's own list
 * of the sections. A problem anchored at NOTHING is about the stage as a whole
 * — a rule relating two of its keys — and no section can be pointed at for it,
 * so it is read out in the schema's own words. Dropping either was the same as
 * accepting it: the save would have gone ahead with nothing on screen to say
 * why it should not have.
 *
 * Each anchored issue is also asked the question the validator's own answer
 * cannot settle: is this a value that is wrong, or a value that is not there?
 * Zod finalises an issue without keeping what it was given, and the code is the
 * same either way — a missing key and a number where a string belongs are both
 * `invalid_type` — so the document it judged is what says which. Read with the
 * same predicate a required field is judged by, so "empty" means one thing in
 * this editor.
 */
function stageProblems(
  identity: StageIdentity,
  fields: StageFormDraft,
): Readonly<{ sections: SectionValidationIssue[]; whole: string[] }> {
  const result = stageSchema.safeParse(stageDocument(identity, fields));
  if (result.success) return { sections: [], whole: [] };
  const sections: SectionValidationIssue[] = [];
  const whole: string[] = [];
  for (const issue of result.error.issues) {
    const path = issue.path.map((part) =>
      typeof part === 'symbol' ? String(part) : part,
    );
    if (path.length === 0) {
      // A key the schema does not name is the HOST's to refuse — it answers
      // `INVALID_SHAPE` for a document that is not shaped like its section, and
      // an editor with a second, stricter opinion would refuse a save the
      // protocol would have taken. Everything else anchored at nothing is a
      // rule about the stage's own keys, which the researcher can act on.
      if (issue.code !== 'unrecognized_keys') whole.push(issue.message);
      continue;
    }
    sections.push({
      path,
      code: issue.code,
      message: issue.message,
      absent: isUnanswered(getValue(fields, path)),
    });
  }
  return { sections, whole };
}

/**
 * What a save that reached nothing is called on screen, and what a read-only
 * editor says about who has the stage.
 *
 * The refusals are encoded rather than formatted, because neither is rendered
 * where it is decided: they are handed to the form as `formErrors`, held there
 * until something replaces them, and rendered by `FormErrors`, which decodes
 * them — so a refusal already on screen follows a change of language.
 *
 * The read-only sentence a WRITE is refused with is not among them: a control
 * can decide for itself that a write may no longer happen, so it lives in
 * `readOnlyRefusal.ts`, where both this shell and those controls read the one
 * declaration of it.
 */
const messages = defineMessages({
  formUnavailable: {
    id: 'protocolBuilder.shell.formUnavailableRefusal',
    defaultMessage:
      'This stage could not be saved because its form is no longer available. Reopen the stage and try again.',
    description:
      'Shown above a stage editor’s fields when a save arrives after the editor’s own form has been taken down, so there are no values left to save.',
  },
  invalidStage: {
    id: 'protocolBuilder.shell.invalidStageRefusal',
    defaultMessage: 'This stage is not finished, so it was not saved.',
    description:
      'Shown above a stage editor’s fields when the stage does not yet satisfy the protocol’s own rules for this interface, so the save was not attempted, and every fault is already stated beside the control that holds it. A stage is one step of an interview.',
  },
  sectionProblem: {
    id: 'protocolBuilder.shell.sectionProblem',
    defaultMessage: '{sectionTitle}: {problem}',
    description:
      'Shown above a stage editor’s fields, once for each thing the protocol refused about the stage, when the save was not attempted. sectionTitle is the name of the section of the editor that holds the value; problem is a whole sentence saying what is wrong with it, already in the reader’s language. Both are given, so this is only the punctuation that joins them.',
  },
  heldBy: {
    id: 'protocolBuilder.shell.heldBy',
    defaultMessage:
      '{holder} is editing this stage, so you can read it but not change it.',
    description:
      'Shown at the top of a stage editor opened while a collaborator holds it. holder is that person’s display name, which the host supplies. A stage is one step of an interview.',
  },
  stageUnavailable: {
    id: 'protocolBuilder.shell.stageUnavailable',
    defaultMessage:
      'This stage could not be opened. It may have been deleted while you were away. Go back to the interview and choose another one.',
    description:
      'Shown in place of a stage editor when the protocol would not open the stage at all — it has been deleted, or the application could not be reached. A stage is one step of an interview.',
  },
  heldByNobodyNamed: {
    id: 'protocolBuilder.shell.heldByNobodyNamed',
    defaultMessage:
      'Somebody else is editing this stage, so you can read it but not change it.',
    description:
      'Shown at the top of a stage editor opened while somebody the host would not name holds it. A stage is one step of an interview.',
  },
});

const UNAVAILABLE_MESSAGE = createMessageError(messages.formUnavailable);
const INVALID_STAGE_MESSAGE = createMessageError(messages.invalidStage);
