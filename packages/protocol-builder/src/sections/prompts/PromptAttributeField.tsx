import { type ReactNode, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import LockedOptions from '../../codebook/components/LockedOptions.tsx';
import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import {
  type CodebookVariableDraft,
  sectionIdForCodebookSubject,
} from '../../codebook/editing.ts';
import { useCodebookSectionDocument } from '../../codebook/useCodebookVariableEdits.ts';
import CodebookVariableValidationEditor from '../../codebook/validation/CodebookVariableValidationEditor.tsx';
import {
  interfaceOwnedOptionsRefusal,
  type WriterClass,
} from '../../codebook/variableRoles.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import { useEditedRowStillInTheList } from '../../form/arrayFields/editedRow.ts';
import { DialogFormField } from '../../form/DialogForm.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { isOptionType } from '../collectableTypes.ts';
import { useLockedOptions, usePromptVariablePool } from './promptCodebook.ts';

/**
 * Its own area rather than the census families': this control is the general
 * way a prompt reaches one codebook attribute, and the sentence below is about
 * the codebook rather than about any one interface.
 */
const messages = defineMessages({
  lockedOptions: {
    id: 'protocolBuilder.promptAttribute.lockedOptions',
    defaultMessage:
      'These values are set by the interface that uses this attribute, so they cannot be changed here.',
    description:
      'Shown under the attribute picker when the values the picked attribute offers are derived by another interface in the protocol, so the researcher cannot edit them from this prompt. An attribute is one thing an interview records about a network member.',
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const variablesIn = (
  document: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> =>
  document !== null && isRecord(document.variables) ? document.variables : {};

/** How many values this attribute currently offers a participant. */
const optionCountOf = (variable: unknown): number =>
  isRecord(variable) && Array.isArray(variable.options)
    ? variable.options.length
    : 0;

/**
 * A nested codebook editor, pinned to what it opened on.
 *
 * `key` is the identity of this opening, `variableId` the attribute it is
 * about, `subject` whose codebook that id is in — the two are one fact, since
 * a record key belongs to exactly one type — and `openedDocument` that
 * subject's section as it stood when the editor opened, for the renders after
 * the section itself has gone.
 */
type OpenedCodebookEdit = Readonly<{
  key: string;
  variableId: string;
  subject: CodebookSubject;
  openedDocument: SectionDoc;
}>;

/** The attribute editor, which is also opened in one of two modes. */
type OpenedVariableEdit = OpenedCodebookEdit &
  Readonly<{ mode: 'create' | 'update' }>;

export type PromptAttributeFieldProps = Readonly<{
  /** The prompt key this pick is held at. */
  name: 'variable' | 'otherVariable' | 'edgeVariable';
  /**
   * Opens a group of its own around the picker. Leave both this and
   * `description` off for a picker that belongs to a group its caller has
   * already opened — a follow-up the researcher switches on, whose heading
   * names the follow-up rather than the attribute inside it.
   */
  title?: string;
  description?: string;
  label: string;
  hint?: ReactNode;
  /** The message shown when the prompt is saved without a pick. */
  requiredMessage: string;
  /**
   * The codebook subject the attribute belongs to; `undefined` until it is
   * known.
   */
  subject: CodebookSubject | undefined;
  /** Only these attribute types can answer this prompt. Pass a constant. */
  types: readonly VariableType[];
  /** The type a brand-new attribute is created as. */
  createType: VariableType;
  /**
   * Which class of writer this picker is — see `usePromptVariablePool`. A bin
   * or a census assigns its value directly (`unvalidated`); a follow-up whose
   * input honours the attribute's own codebook validation is `validated`.
   */
  writerClass: WriterClass;
  /** Visible text and accessible name of the create control. */
  createLabel: string;
  /**
   * Visible text and accessible name of the control that edits the picked
   * attribute's VALUES. Leave it off for a picker whose attribute type has no
   * values to edit — a follow-up the participant types into is text, and a
   * named control that can never appear reads like one a researcher cannot
   * find.
   */
  editLabel?: string;
  /**
   * Visible text and accessible name of the control that edits the picked
   * attribute's validation rules, which is the only thing standing between a
   * participant TYPING an answer and one the study cannot use. Leave it off
   * for a picker whose participant never types: a bin or a scale is answered
   * by dragging or tapping, which no rule could refuse.
   */
  validationLabel?: string;
  emptyMessage: string;
  /** The pick this prompt already had, so reopening it never loses the pick. */
  committedValue?: string;
  /** The number of values this interface is designed to show at once. */
  optionLimit?: number;
  /**
   * Values the interface draws beside this attribute's own, which take up the
   * same room and count against the same limit — a Categorical Bin's follow-up
   * bin is a ninth bin on a screen designed for eight. Nothing here can know
   * about them: they are the caller's own fields, and whether they are in use
   * changes while the prompt is open.
   */
  extraCountedOptions?: number;
  optionLimitTitle?: string;
  optionLimitDescription?: ReactNode;
}>;

/**
 * The codebook attribute one prompt writes, and the values it offers.
 *
 * The attribute lives in a different protocol section from the stage, so
 * creating one — or changing the values it offers — is a compound edit rather
 * than part of this prompt: it lands in the codebook whole or not at all, and
 * the prompt then points at it as an ordinary unsaved change. Saving both
 * together could never succeed, for the reason the subject section gives: a
 * prompt naming a brand-new attribute is not yet a prompt the protocol schema
 * accepts, and a host is right to refuse it.
 *
 * Replaces Architect's `NewVariableWindow` and the inline option list its bin
 * prompts carried, both of which wrote the codebook through a Redux thunk.
 *
 * Creating opens the codebook's own `VariableEditor` rather than reusing
 * `CreatableVariablePicker`, which asks only for a name. What these prompts
 * create is mostly categorical or ordinal — the attribute's values ARE the
 * bins, or the points of the scale — and `categoricalOptionsSchema` requires
 * at least two of them, so an attribute created from a name alone would be
 * refused by the schema every time, and the researcher would be sent to the
 * codebook and back to finish what they had just started. The editor also
 * carries the two things a name box has nowhere to put: the values themselves,
 * and the rules the follow-up pickers edit beside them.
 *
 * The one attribute here that a name alone WOULD be enough for is the
 * categorical bin's follow-up, which is text. It goes through the same control
 * anyway: one way to invent an attribute across a family of dialogs is worth
 * more than a shorter path through one of them.
 */
export default function PromptAttributeField({
  name,
  title,
  description,
  label,
  hint,
  requiredMessage,
  subject,
  types,
  createType,
  writerClass,
  createLabel,
  editLabel,
  validationLabel,
  emptyMessage,
  committedValue,
  optionLimit,
  extraCountedOptions = 0,
  optionLimitTitle,
  optionLimitDescription,
}: PromptAttributeFieldProps) {
  const intl = useAppIntl();
  const { controller, readOnly } = useStageEditorForm();
  /**
   * Whether the prompt this picker belongs to is still a row the list holds.
   *
   * A prompt removed by a collaborator leaves its dialog open over the draft —
   * `DialogArrayField` keeps it so the work can be read and rescued — and a
   * removed row can never be committed again. Every write below goes to the
   * CODEBOOK, which would land whole while the prompt pointing at it never
   * could, so an attribute invented here would be left in the protocol for a
   * question nobody can ask. See `editedRow.ts`.
   */
  const rowStillInTheList = useEditedRowStillInTheList();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  // Read the field's own state, falling back to the row the dialog opened on:
  // the picker registers a render after this component first mounts, and the
  // pool's "keep the current pick" escape must not lapse in between.
  const picked = useFormStore((state) => {
    const entry = state.fields.get(name) ?? state.dormantValues.get(name);
    if (entry === undefined) return committedValue;
    return typeof entry.value === 'string' && entry.value !== ''
      ? entry.value
      : undefined;
  });

  const options = usePromptVariablePool({
    subject,
    types,
    writerClass,
    currentValue: picked,
  });
  const codebookDocument = useCodebookSectionDocument(subject);
  const lockedOptions = useLockedOptions(subject, picked);
  const [editing, setEditing] = useState<OpenedVariableEdit | null>(null);
  /**
   * The words on the control that opened the dialog, read live rather than
   * captured into `editing` at the moment it opened: a label formatted then
   * and held since is the one thing left in the old language after the
   * researcher changes it while the dialog is still open.
   */
  const editingTitle =
    editing?.mode === 'create' ? createLabel : (editLabel ?? createLabel);
  /** The validation surface for the pick, open on the key it was opened at. */
  const [validating, setValidating] = useState<OpenedCodebookEdit | null>(null);
  /**
   * The section an editor already open reads: the one it was OPENED against,
   * resolved live FOR THAT SUBJECT so a collaborator's changes to it still
   * reach the editor, and falling back to the copy taken when it opened for
   * the renders after the section itself has gone.
   *
   * The same rule `AttributeCodebookControls` follows over a row. Never the
   * subject the stage points at NOW: the attribute being edited is named by a
   * record key that belongs to one type alone — `CodebookSchema` refuses a
   * codebook that reuses one across types — so a stage a collaborator repoints
   * mid-edit would otherwise leave this editor creating the attribute on the
   * type the stage moved to, or looking an existing one up in a document it
   * was never in.
   */
  const editingDocument = useCodebookSectionDocument(editing?.subject);
  const openEditor =
    editing === null
      ? null
      : { ...editing, document: editingDocument ?? editing.openedDocument };
  /**
   * Whether the values an open editor is writing have become the protocol's
   * rather than the researcher's, read LIVE and asked about the attribute the
   * editor is actually on — its own `variableId` and the subject it opened
   * against, never the picker's current pick.
   *
   * A collaborator binding this attribute to an interface that derives its
   * values takes the launch control away, and an editor already open would
   * otherwise stay writable: `writable` asks only about the lease and the
   * subject, and neither of them moved. The draft is kept and shown, as it is
   * in all three of `writable`'s cases, with the refusal above it and the save
   * disabled — the same rule the family follows for a lease taken back or a
   * stage repointed mid-edit.
   */
  const editorLockedOptions = useLockedOptions(
    editing?.subject,
    editing?.variableId,
  );
  const validatingDocument = useCodebookSectionDocument(validating?.subject);
  const openValidating =
    validating === null
      ? null
      : {
          ...validating,
          document: validatingDocument ?? validating.openedDocument,
        };
  /**
   * Whether what is open may be WRITTEN, which is four questions.
   *
   * A lease taken back says this researcher may write nothing. A section that
   * has gone — the type deleted under them — is a section nothing can be
   * written into. A stage repointed at another type says it a third way: the
   * prompt this editor was opened from is a prompt about something else now,
   * and the row holding it cannot commit, so an attribute created here would
   * be left behind in a codebook nothing points at. And the prompt ROW itself
   * can go while the stage stays exactly where it was — a collaborator
   * removing this one question — which leaves the same orphan by a different
   * route and is the same refusal. The draft is kept and shown in all four,
   * refused rather than thrown away, exactly as the row dialog around it is
   * kept.
   */
  const writable = (
    opened: CodebookSubject,
    live: SectionDoc | null,
  ): boolean =>
    !readOnly &&
    rowStillInTheList &&
    live !== null &&
    subject !== undefined &&
    sectionIdForCodebookSubject(subject) ===
      sectionIdForCodebookSubject(opened);
  /**
   * Whether the ATTRIBUTE editor is refused, which is `writable`'s three
   * questions and the values having become interface-owned under it.
   *
   * The fourth is asked here rather than left to `VariableEditor`, which is
   * handed one document and one attribute and cannot see a binding a stage
   * elsewhere in the protocol declares.
   */
  const editorReadOnly =
    openEditor === null ||
    !writable(openEditor.subject, editingDocument) ||
    editorLockedOptions !== undefined;
  /**
   * Whether a codebook edit is in flight, which is a fact this host has for
   * itself: an editor owns its draft and this owns request execution, so every
   * request passes through here on its way out and its answer on the way back.
   */
  const [submitting, setSubmitting] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const validationTrigger = useRef<HTMLButtonElement>(null);

  const optionCount =
    (lockedOptions?.length ??
      optionCountOf(variablesIn(codebookDocument)[picked ?? ''])) +
    extraCountedOptions;
  const overLimit = optionLimit !== undefined && optionCount > optionLimit;
  /**
   * The values control, or `null` where there is nothing for it to edit: an
   * attribute this picker cannot offer one for, values another interface owns,
   * or a type with no values at all.
   */
  const valuesEditor =
    editLabel !== undefined &&
    picked !== undefined &&
    lockedOptions === undefined &&
    isOptionType(createType)
      ? { label: editLabel, variableId: picked }
      : null;
  /** The validation control, for a pick whose participant types their answer. */
  const validationEditor =
    validationLabel !== undefined && picked !== undefined
      ? { label: validationLabel, variableId: picked }
      : null;

  /*
    Nothing here checks the draft for a rule it could never satisfy — an
    attribute told to require three answers left with two to choose from. This
    used to, and the check was dead: `AuxiliaryCodebookDraftSession.submit`
    builds the request BEFORE it calls this hook, and
    `buildUpdateVariableRequest` validates the whole entity document as it
    does, so the schema's own contradiction rules throw first, every time. The
    check could only ever run on drafts the schema had already accepted.

    The refusal is the schema's, and `VariableEditor` is where its sentence is
    turned into words for the researcher.
  */

  const closeEditor = () => {
    setEditing(null);
  };

  /**
   * The compound edit an open editor submits, with the dialog held shut while
   * it is in flight.
   *
   * The request outlives the dialog: dismissed mid-flight the editor is
   * unmounted but the handler awaiting the host is still alive, so a refusal
   * is shown to nobody and a success still runs `onComplete` — which, for the
   * create, points the prompt at an attribute the researcher watched no editor
   * finish. `SubjectSection`'s own create dialog withholds every way out for
   * exactly this, and these three are the same act.
   */
  const submitEdit = async (
    request: Parameters<typeof controller.requestCompoundEdit>[0],
  ) => {
    setSubmitting(true);
    try {
      return await controller.requestCompoundEdit(request);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Every way out of an open editor, which is one handler.
   *
   * Escape, a press outside and the close button all arrive at `closeDialog`,
   * so refusing there covers all three — and `dismissible` takes the close
   * button away rather than leaving a control on screen that does nothing.
   */
  const requestCloseEditor = () => {
    if (submitting) return;
    closeEditor();
  };
  const requestCloseValidating = () => {
    if (submitting) return;
    setValidating(null);
  };

  const body = (
    <>
      <DialogFormField<typeof VariablePickerControl>
        name={name}
        label={label}
        {...(hint === undefined ? {} : { hint })}
        component={VariablePickerControl}
        options={options}
        emptyMessage={emptyMessage}
        required={requiredMessage}
      />
      {!readOnly &&
        rowStillInTheList &&
        subject !== undefined &&
        codebookDocument !== null && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              ref={createTrigger}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setEditing({
                  key: uuid(),
                  mode: 'create',
                  variableId: uuid(),
                  subject,
                  openedDocument: codebookDocument,
                })
              }
            >
              {createLabel}
            </Button>
            {valuesEditor !== null && (
              <Button
                ref={editTrigger}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditing({
                    key: uuid(),
                    mode: 'update',
                    variableId: valuesEditor.variableId,
                    subject,
                    openedDocument: codebookDocument,
                  })
                }
              >
                {valuesEditor.label}
              </Button>
            )}
            {validationEditor !== null && (
              <Button
                ref={validationTrigger}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setValidating({
                    key: uuid(),
                    variableId: validationEditor.variableId,
                    subject,
                    openedDocument: codebookDocument,
                  })
                }
              >
                {validationEditor.label}
              </Button>
            )}
          </div>
        )}
      {/* The values themselves, and not only the reason they are fixed: they
          ARE the bins this prompt sorts into, or the points of the scale it
          offers, and a researcher who cannot see them cannot tell what the
          prompt asks. The same surface the codebook editor shows them on
          (`LockedOptions`), so the one thing that differs between the two
          places a locked list appears is the sentence over it. */}
      {picked !== undefined && lockedOptions !== undefined && (
        <div className="mt-4">
          <LockedOptions
            options={lockedOptions}
            caption={intl.formatMessage(messages.lockedOptions)}
          />
        </div>
      )}
      {overLimit && (
        <Alert variant="warning" className="mt-6">
          <AlertTitle>{optionLimitTitle}</AlertTitle>
          <AlertDescription>{optionLimitDescription}</AlertDescription>
        </Alert>
      )}
      {/* An editor already open survives the write being taken away, and is
          refused instead. The launch controls above go — nobody may START a
          codebook edit they cannot finish, whether because editing was revoked
          or because the prompt row has left the list — but the draft inside
          this dialog was made in this session, and unmounting it would throw
          away work to say something the disabled save says for itself. The
          same rule the row editors follow (`AttributeCodebookControls`,
          `SubjectSection`). */}
      {openEditor !== null && (
        <Dialog
          open
          title={editingTitle}
          size="readable"
          dismissible={!submitting}
          closeDialog={requestCloseEditor}
          finalFocus={() =>
            openEditor.mode === 'create'
              ? createTrigger.current
              : editTrigger.current
          }
        >
          {/* Said here rather than left to the editor, which is handed one
              document and one attribute and cannot see the binding that took
              the values away. The save-time refusal's own words
              (`interfaceOwnedOptionsRefusal`), so a researcher who meets both
              meets one sentence — and it says the way out, which is to close
              the dialog and reopen it on the values the interface now owns. */}
          {editorLockedOptions !== undefined && (
            <Alert variant="warning" appearance="soft" density="compact">
              <AlertDescription>
                {intl.formatMessage(interfaceOwnedOptionsRefusal)}
              </AlertDescription>
            </Alert>
          )}
          {openEditor.mode === 'create' ? (
            <VariableEditor
              mode="create"
              openId={openEditor.key}
              subject={openEditor.subject}
              protocolContext={controller.snapshot.protocolContext}
              authoritativeDocument={openEditor.document}
              variableId={openEditor.variableId}
              initialDraft={newVariableDraft(createType)}
              allowedVariableTypes={types}
              readOnly={editorReadOnly}
              description={createLabel}
              title={createLabel}
              createRequestId={() => uuid()}
              onSubmitRequest={submitEdit}
              onComplete={(variableId) => {
                setFieldValue(name, variableId);
                closeEditor();
              }}
            />
          ) : (
            <VariableEditor
              mode="update"
              openId={openEditor.key}
              subject={openEditor.subject}
              authoritativeDocument={openEditor.document}
              variableId={openEditor.variableId}
              initialDraft={existingVariableDraft(
                variablesIn(openEditor.document)[openEditor.variableId],
                createType,
              )}
              allowedVariableTypes={types}
              readOnly={editorReadOnly}
              description={editingTitle}
              title={editingTitle}
              createRequestId={() => uuid()}
              onSubmitRequest={submitEdit}
              onComplete={closeEditor}
            />
          )}
        </Dialog>
      )}
      {openValidating !== null && validationLabel !== undefined && (
        <Dialog
          open
          title={validationLabel}
          size="readable"
          dismissible={!submitting}
          closeDialog={requestCloseValidating}
          finalFocus={() => validationTrigger.current}
        >
          <CodebookVariableValidationEditor
            openId={openValidating.key}
            subject={openValidating.subject}
            variableId={openValidating.variableId}
            authoritativeEntityDocument={openValidating.document}
            allSubjectVariables={variablesIn(openValidating.document)}
            requestMetadata={{
              createId: () => uuid(),
              description: validationLabel,
            }}
            readOnly={!writable(openValidating.subject, validatingDocument)}
            onSubmitRequest={submitEdit}
            onComplete={() => setValidating(null)}
          />
        </Dialog>
      )}
    </>
  );

  if (title === undefined) return body;
  return (
    <Section title={title} description={description}>
      {body}
    </Section>
  );
}

/**
 * A brand-new attribute of the type this prompt needs. The type is pre-filled
 * because the prompt has already decided it: a categorical bin cannot bin a
 * number.
 */
const newVariableDraft = (type: VariableType): CodebookVariableDraft =>
  isOptionType(type) ? { name: '', type, options: [] } : { name: '', type };

/** The attribute as the codebook currently holds it. */
const existingVariableDraft = (
  variable: unknown,
  fallbackType: VariableType,
): CodebookVariableDraft =>
  isRecord(variable) ? variable : { name: '', type: fallbackType };
