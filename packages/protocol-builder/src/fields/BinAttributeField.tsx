import { useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { VariableType, Variables } from '@codaco/protocol-validation';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  hasUnvalidatedUse,
  hasValidatedUse,
  interfaceOwnedPickIssue,
  type WriterClass,
} from '../codebook/variableRoles.ts';
import {
  crossClassConflictMessage,
  crossClassPickIssue,
} from '../codebook/variableValidation.ts';
import { binMessages } from '../editors/ordinal-bin/sections/binMessages.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import type {
  ProtocolBuilderProtocolContext,
  CodebookSubject,
} from '../protocol-context.ts';
import { variablesForSubject } from '../protocol-context.ts';
import { useRowValue } from '../sections/AttributeCodebookControls.tsx';
import AttributeValueFields, {
  attributeOptionsFieldFor,
} from '../sections/AttributeValueFields.tsx';
import { useCreateAttributeForSlot } from '../sections/create-variable/useCreateAttributeForSlot.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import VariablePickerField from './VariablePickerField.tsx';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * How many values the attribute offers, as the CODEBOOK holds them.
 *
 * The stand-in for wherever the row has no control holding the list: an
 * attribute whose values another interface owns is shown read-only, and a
 * collaborator adding one still changes what this stage draws.
 *
 * The literal type comparisons narrow the variable union far enough for
 * `options` to exist on it, as `lockedVariableOptions` does.
 */
const valueCount = (
  variables: Readonly<Variables>,
  variableId: string | undefined,
): number => {
  const variable = variableId === undefined ? undefined : variables[variableId];
  if (variable === undefined) return 0;
  return variable.type === 'categorical' || variable.type === 'ordinal'
    ? variable.options.length
    : 0;
};

export type BinAttributeSlot = Readonly<{
  /** Where the prompt keeps this attribute. */
  name: string;
  /** The only kind of answer this slot can bind. */
  variableType: VariableType;
  /**
   * Whether the participant's answer reaches this attribute through anything
   * that could check it: `unvalidated` for the bins, where dropping someone in
   * writes the value as it is, and `validated` for the follow-up answer, which
   * is typed into an input honouring the attribute's own codebook rules.
   */
  writerClass: WriterClass;
  /** Said when the pick names an attribute this slot can no longer use. */
  goneRefusal: MessageDescriptor;
}>;

export type BinAttributeFieldProps = Readonly<{
  slot: BinAttributeSlot;
  subject: CodebookSubject | undefined;
  /** The attribute this prompt was OPENED holding, for the field's seed. */
  committed: string | undefined;
  label: string;
  hint: string;
  emptyMessage: string;
  requiredMessage: string;
  createLabel: string;
  /**
   * How many values this interface can draw before the bins stop being
   * readable, with the sentence saying so. Omitted for a slot that draws no
   * bins at all.
   */
  optionLimit?: number;
  optionLimitDescription?: string;
  /**
   * Bins this interface draws that are not the attribute's own values — the
   * one a categorical bin adds for everything else.
   */
  extraBins?: number;
}>;

/**
 * The attribute a bin prompt sorts people by, and the codebook edits that
 * attribute invites.
 *
 * Shared by the two bins and by the follow-up answer a categorical bin
 * collects, which are the same question asked of different kinds of answer.
 */
export default function BinAttributeField({
  slot,
  subject,
  committed,
  label,
  hint,
  emptyMessage,
  requiredMessage,
  createLabel,
  optionLimit,
  optionLimitDescription,
  extraBins = 0,
}: BinAttributeFieldProps) {
  const intl = useAppIntl();
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  // The DIALOG's own store: the pick only exists there until the row is saved,
  // so a reader that looked past it to the stage would never see the
  // researcher choose anything.
  const picked = asString(useRowValue(slot.name)) ?? committed;
  const { createProps, editor } = useCreateAttributeForSlot({
    subject,
    variableType: slot.variableType,
    title: createLabel,
    onCreated: (variableId) => setFieldValue(slot.name, variableId),
  });

  const allVariables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const options = useMemo(() => {
    if (subject === undefined) return [];
    // The role map excludes the stage being edited: this form's own unsaved
    // prompts are the authority on what this stage writes, and the saved copy
    // of them is stale the moment editing begins.
    const roleMap = buildVariableRoleMap(protocolContext, identity.id);
    const pool = Object.entries(allVariables).flatMap(([value, variable]) =>
      variable.type === slot.variableType
        ? [{ value, label: variable.name, type: variable.type }]
        : [],
    );
    const keep = picked === undefined ? [] : [picked];
    const withoutConflicts =
      slot.writerClass === 'unvalidated'
        ? excludeValidatedUses(roleMap, subject, pool, keep)
        : excludeUnvalidatedUses(roleMap, subject, pool, keep);
    // An attribute another interface DERIVES from the structure a participant
    // builds is never a bin: this stage writes it by drag-and-drop and would
    // overwrite what that interface computes. An attribute whose VALUES an
    // interface owns is a different matter and stays on offer — sorting family
    // members by sex is legitimate authoring — with its values shown read-only
    // below.
    return excludeInterfaceOwned(
      buildExclusiveVariableSlotMap(protocolContext),
      subject,
      withoutConflicts,
      keep,
    );
  }, [allVariables, identity.id, picked, protocolContext, slot, subject]);

  // Counted from the list the researcher is LOOKING at. The values are edited
  // inline in this dialog and saving closes it, so a warning counted from the
  // stored list would appear only once they can no longer see the list it is
  // about — which is after the decision it exists to inform.
  const draftedValues = useRowValue(attributeOptionsFieldFor(slot.name));
  const drawn =
    (Array.isArray(draftedValues)
      ? draftedValues.length
      : valueCount(allVariables, picked)) + extraBins;

  return (
    <>
      <Field<typeof VariablePickerField>
        name={slot.name}
        component={VariablePickerField}
        label={label}
        hint={hint}
        options={options}
        emptyMessage={emptyMessage}
        initialValue={committed}
        required={requiredMessage}
        {...createProps}
      />
      {/*
        The create row escalates to the codebook's own attribute editor for a
        kind of answer a name cannot finish: an attribute a participant is
        sorted BY is its list of values, and the schema refuses one with fewer
        than two.
      */}
      {editor}
      {/* The values this prompt will draw as bins, edited where the prompt is
          written, as Architect had them
          (`sections/OrdinalBinPrompts/PromptFields.tsx`'s "Attribute options").
          Read-only where an interface owns the list. Written to the codebook
          attribute by this row's own save. */}
      <AttributeValueFields
        subject={subject}
        variableId={picked}
        optionsField={attributeOptionsFieldFor(slot.name)}
      />
      {optionLimit !== undefined &&
        optionLimitDescription !== undefined &&
        drawn > optionLimit && (
          <Alert variant="warning" className="mb-8">
            <AlertTitle>
              {intl.formatMessage(binMessages.binLimitTitle)}
            </AlertTitle>
            <AlertDescription>{optionLimitDescription}</AlertDescription>
          </Alert>
        )}
    </>
  );
}

/**
 * The refusal a bin prompt's attribute can earn that no control can raise for
 * itself, or `undefined` when the pick is sound.
 *
 * Three questions, in an order where each is only meaningful once the one
 * before it is answered. Is the attribute still there and still the kind of
 * answer this slot draws? Is it claimed by a writer of the opposite class
 * elsewhere — with the escape an unchanged pick is owed, because an imported
 * protocol's own contradiction is not one the researcher introduced here? And
 * is it one another interface derives, which has NO such escape, since
 * re-saving would go on overwriting what that interface computes.
 *
 * A gate rather than a rule on the control: the second question needs the row
 * as the dialog OPENED on it, which only `beforeSave` is given.
 */
export function binAttributePickIssue({
  protocolContext,
  excludedStageId,
  subject,
  slot,
  variableId,
  openedOnVariableId,
}: Readonly<{
  protocolContext: ProtocolBuilderProtocolContext;
  excludedStageId: string;
  subject: CodebookSubject | undefined;
  slot: BinAttributeSlot;
  variableId: string;
  openedOnVariableId: string;
}>): string | undefined {
  if (subject === undefined || variableId === '') return undefined;

  const allVariables = variablesForSubject(protocolContext, subject);
  if (allVariables[variableId]?.type !== slot.variableType) {
    return createMessageError(slot.goneRefusal);
  }

  const roleMap = buildVariableRoleMap(protocolContext, excludedStageId);
  const conflict = crossClassPickIssue({
    variableId,
    originalVariableId: openedOnVariableId,
    hasConflictingUse: (candidate) =>
      slot.writerClass === 'unvalidated'
        ? hasValidatedUse(roleMap, subject, candidate)
        : hasUnvalidatedUse(roleMap, subject, candidate),
    allVariables,
    message: crossClassConflictMessage[slot.writerClass],
  });
  if (conflict !== undefined) return conflict;

  return interfaceOwnedPickIssue(
    buildExclusiveVariableSlotMap(protocolContext),
    subject,
    variableId,
  );
}
