import { type ReactNode, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import VariableEditor from '../../codebook/components/VariableEditor.tsx';
import type { CodebookVariableDraft } from '../../codebook/editing.ts';
import type { WriterClass } from '../../codebook/variableRoles.ts';
import { findDraftContradictions } from '../../codebook/variableValidation.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import type { CompoundEditRequest, CompoundEditResult } from '../../session.ts';
import {
  useCodebookSectionDocument,
  useLockedOptions,
  usePromptVariablePool,
} from './promptCodebook.ts';

const OPTION_TYPES: readonly VariableType[] = Object.freeze([
  'categorical',
  'ordinal',
]);

const LOCKED_OPTIONS_EXPLANATION =
  'These values are set by the interface that uses this attribute, so they cannot be changed here.';

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
  /** Visible text and accessible name of the edit control. */
  editLabel: string;
  emptyMessage: string;
  /** The pick this prompt already had, so reopening it never loses the pick. */
  committedValue?: string;
  /** The number of values this interface is designed to show at once. */
  optionLimit?: number;
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
  emptyMessage,
  committedValue,
  optionLimit,
  optionLimitTitle,
  optionLimitDescription,
}: PromptAttributeFieldProps) {
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
  const codebookDocument = useCodebookSectionDocument(subject);
  const lockedOptions = useLockedOptions(subject, picked);
  const [editing, setEditing] = useState<{
    key: string;
    mode: 'create' | 'update';
    variableId: string;
  } | null>(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const latestDraft = useRef<CodebookVariableDraft | null>(null);

  const optionCount =
    lockedOptions?.length ??
    optionCountOf(variablesIn(codebookDocument)[picked ?? '']);
  const overLimit = optionLimit !== undefined && optionCount > optionLimit;
  const editableOptions =
    picked !== undefined &&
    lockedOptions === undefined &&
    OPTION_TYPES.includes(createType);

  /**
   * Refuses values the attribute's own committed validation rules could never
   * be satisfied by — one told to require three answers cannot be left with
   * two to choose from. The same check the codebook's field editors run, asked
   * here because this is where the values change.
   */
  const submitVariableEdit = async (
    request: CompoundEditRequest,
  ): Promise<CompoundEditResult> => {
    const draft = latestDraft.current;
    if (draft !== null && typeof draft.type === 'string') {
      const contradiction = findDraftContradictions({
        allVariables: variablesIn(codebookDocument),
        currentVariableId: editing?.variableId ?? '',
        variableType: draft.type,
        validation: isRecord(draft.validation) ? draft.validation : {},
        options: draft.options,
      })[0];
      if (contradiction !== undefined) {
        return {
          status: 'failed',
          reason: 'invalid-request',
          message: contradiction.message,
        };
      }
    }
    return controller.requestCompoundEdit(request);
  };

  const closeEditor = () => {
    latestDraft.current = null;
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
            onClick={() => {
              latestDraft.current = null;
              setEditing({ key: uuid(), mode: 'create', variableId: uuid() });
            }}
          >
            {createLabel}
          </Button>
          {editableOptions && (
            <Button
              ref={editTrigger}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                latestDraft.current = null;
                setEditing({ key: uuid(), mode: 'update', variableId: picked });
              }}
            >
              {editLabel}
            </Button>
          )}
        </div>
      )}
      {picked !== undefined && lockedOptions !== undefined && (
        <p className="text-muted mt-4 text-sm">{LOCKED_OPTIONS_EXPLANATION}</p>
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
          title={editing.mode === 'create' ? createLabel : editLabel}
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
              onDraftChange={(draft) => {
                latestDraft.current = draft;
              }}
              onSubmitRequest={submitVariableEdit}
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
              description={editLabel}
              title={editLabel}
              createRequestId={() => uuid()}
              onDraftChange={(draft) => {
                latestDraft.current = draft;
              }}
              onSubmitRequest={submitVariableEdit}
              onComplete={closeEditor}
            />
          )}
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
