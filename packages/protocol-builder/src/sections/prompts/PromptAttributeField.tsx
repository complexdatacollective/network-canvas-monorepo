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

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import type { CodebookVariableDraft } from '../../codebook/editing.ts';
import { useCodebookSectionDocument } from '../../codebook/useCodebookVariableEdits.ts';
import CodebookVariableValidationEditor from '../../codebook/validation/CodebookVariableValidationEditor.tsx';
import type { WriterClass } from '../../codebook/variableRoles.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { useLockedOptions, usePromptVariablePool } from './promptCodebook.ts';

const OPTION_TYPES: readonly VariableType[] = Object.freeze([
  'categorical',
  'ordinal',
]);

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
  /** The codebook subject the attribute belongs to; `null` until it is known. */
  subject: CodebookSubject | null;
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
  // `undefined` rather than `null`: the shared hook takes the codebook's own
  // absent-subject value, and this family's is the picker's.
  const codebookDocument = useCodebookSectionDocument(subject ?? undefined);
  const lockedOptions = useLockedOptions(subject, picked);
  const [editing, setEditing] = useState<{
    key: string;
    /** The words on the control that opened it, which name what it does. */
    label: string;
    mode: 'create' | 'update';
    variableId: string;
  } | null>(null);
  /** The validation surface for the pick, open on the key it was opened at. */
  const [validating, setValidating] = useState<{
    key: string;
    variableId: string;
  } | null>(null);
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
    OPTION_TYPES.includes(createType)
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
      {!readOnly && subject !== null && codebookDocument !== null && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            ref={createTrigger}
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setEditing({
                key: uuid(),
                label: createLabel,
                mode: 'create',
                variableId: uuid(),
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
                  label: valuesEditor.label,
                  mode: 'update',
                  variableId: valuesEditor.variableId,
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
                })
              }
            >
              {validationEditor.label}
            </Button>
          )}
        </div>
      )}
      {picked !== undefined && lockedOptions !== undefined && (
        <p className="text-muted mt-4 text-sm">
          {intl.formatMessage(messages.lockedOptions)}
        </p>
      )}
      {overLimit && (
        <Alert variant="warning" className="mt-6">
          <AlertTitle>{optionLimitTitle}</AlertTitle>
          <AlertDescription>{optionLimitDescription}</AlertDescription>
        </Alert>
      )}
      {editing !== null && codebookDocument !== null && subject !== null && (
        <Dialog
          open
          title={editing.label}
          size="readable"
          closeDialog={closeEditor}
          finalFocus={() =>
            editing.mode === 'create'
              ? createTrigger.current
              : editTrigger.current
          }
        >
          {editing.mode === 'create' ? (
            <VariableEditor
              mode="create"
              openId={editing.key}
              subject={subject}
              protocolContext={controller.snapshot.protocolContext}
              authoritativeDocument={codebookDocument}
              variableId={editing.variableId}
              initialDraft={newVariableDraft(createType)}
              allowedVariableTypes={types}
              description={createLabel}
              title={createLabel}
              createRequestId={() => uuid()}
              onSubmitRequest={(request) =>
                controller.requestCompoundEdit(request)
              }
              onComplete={(variableId) => {
                setFieldValue(name, variableId);
                closeEditor();
              }}
            />
          ) : (
            <VariableEditor
              mode="update"
              openId={editing.key}
              subject={subject}
              authoritativeDocument={codebookDocument}
              variableId={editing.variableId}
              initialDraft={existingVariableDraft(
                variablesIn(codebookDocument)[editing.variableId],
                createType,
              )}
              allowedVariableTypes={types}
              description={editing.label}
              title={editing.label}
              createRequestId={() => uuid()}
              onSubmitRequest={(request) =>
                controller.requestCompoundEdit(request)
              }
              onComplete={closeEditor}
            />
          )}
        </Dialog>
      )}
      {validating !== null &&
        validationLabel !== undefined &&
        codebookDocument !== null &&
        subject !== null && (
          <Dialog
            open
            title={validationLabel}
            size="readable"
            closeDialog={() => setValidating(null)}
            finalFocus={() => validationTrigger.current}
          >
            <CodebookVariableValidationEditor
              openId={validating.key}
              subject={subject}
              variableId={validating.variableId}
              authoritativeEntityDocument={codebookDocument}
              allSubjectVariables={variablesIn(codebookDocument)}
              requestMetadata={{
                createId: () => uuid(),
                description: validationLabel,
              }}
              onSubmitRequest={(request) =>
                controller.requestCompoundEdit(request)
              }
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
  OPTION_TYPES.includes(type)
    ? { name: '', type, options: [] }
    : { name: '', type };

/** The attribute as the codebook currently holds it. */
const existingVariableDraft = (
  variable: unknown,
  fallbackType: VariableType,
): CodebookVariableDraft =>
  isRecord(variable) ? variable : { name: '', type: fallbackType };
