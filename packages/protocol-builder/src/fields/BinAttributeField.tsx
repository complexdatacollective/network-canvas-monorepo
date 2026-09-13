import { Lock } from 'lucide-react';
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
  buildInterfaceOwnedOptionMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  hasUnvalidatedUse,
  hasValidatedUse,
  interfaceOwnedPickIssue,
  type LockedOptionList,
  lockedVariableOptions,
  type WriterClass,
  variableRoleKey,
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
import AttributeCodebookControls, {
  useRowValue,
} from '../sections/AttributeCodebookControls.tsx';
import CreateVariableButton from '../sections/create-variable/CreateVariableButton.tsx';
import { useProtocolContext } from '../state/protocolContext.ts';
import VariablePickerField from './VariablePickerField.tsx';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * A bin prompt keeps no input control: the participant drags, and the value
 * the bin stands for is written as it is. So the key named here is one the row
 * never holds, and the codebook's own control is what the settings are keyed
 * on.
 */
const NO_ROW_COMPONENT = 'component';

/**
 * How many values the attribute offers, read from the CODEBOOK rather than
 * from the row: the values belong to the attribute, so a collaborator adding
 * one changes what this stage draws.
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

/**
 * The values a bin will offer, shown rather than edited.
 *
 * An interface that both writes an attribute and branches on its exact values
 * owns that list however the attribute is reached. Shown INSTEAD of the
 * control that would edit them, as Architect does.
 *
 * The values as well as the labels, because a researcher who reads only the
 * labels cannot tell what this prompt records. The reason is the table's
 * CAPTION, so it reaches a screen reader as the table's own name rather than
 * through the padlock and the dimmed background alone.
 */
function LockedOptions({ options }: Readonly<{ options: LockedOptionList }>) {
  const intl = useAppIntl();

  return (
    <div className="bg-surface-2 text-text relative mb-8 rounded p-4">
      <Lock aria-hidden className="absolute top-4 right-4 h-4 w-4" />
      <table className="w-full text-sm">
        <caption className="pr-8 pb-2 text-left text-sm">
          {intl.formatMessage(binMessages.lockedOptions)}
        </caption>
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-bold">
              {intl.formatMessage(binMessages.lockedOptionsLabelColumn)}
            </th>
            <th className="pb-2 font-bold">
              {intl.formatMessage(binMessages.lockedOptionsValueColumn)}
            </th>
          </tr>
        </thead>
        <tbody>
          {options.map((option) => (
            <tr key={String(option.value)}>
              <td className="py-1">{option.label}</td>
              <td className="font-monospace py-1">{String(option.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
 * Three controls, in the order a researcher meets them: pick one of the
 * attributes this slot can bind, invent one if none fits, and change what the
 * one they picked holds. The third is `AttributeCodebookControls`, which is
 * where Architect's inline option editor went — and, for the follow-up answer
 * alone, its validation section: an attribute lives in a different protocol
 * section from the stage, so editing it takes that section's own lock and
 * commits on its own.
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

  const locked = useMemo(
    () =>
      subject === undefined || picked === undefined
        ? undefined
        : lockedVariableOptions(
            allVariables,
            picked,
            buildInterfaceOwnedOptionMap(protocolContext)[
              variableRoleKey(subject, picked)
            ],
          ),
    [allVariables, picked, protocolContext, subject],
  );

  const drawn = valueCount(allVariables, picked) + extraBins;

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
      />
      {/*
        Creating one opens the codebook's own attribute editor rather than
        asking for a name: an attribute a participant is sorted BY is its list
        of values, and the schema refuses one with fewer than two — so a name
        box would send the researcher to the codebook and back to finish what
        they had just started.
      */}
      <CreateVariableButton
        subject={subject ?? null}
        variableType={slot.variableType}
        label={createLabel}
        onCreated={(variableId) => setFieldValue(slot.name, variableId)}
      />
      {locked === undefined ? (
        <AttributeCodebookControls
          subject={subject}
          variableField={slot.name}
          committedVariable={committed}
          componentField={NO_ROW_COMPONENT}
          // The bins themselves are filled by dragging, and the interview
          // reads no rules on their way in — the schema says so by declaring
          // this reference `unvalidatedAttribute`, and its own writer
          // exclusivity then keeps a form from collecting the same attribute
          // anywhere else. Only the follow-up answer is typed, so only the
          // follow-up is offered rules to check it against.
          offerRules={slot.writerClass === 'validated'}
        />
      ) : (
        <LockedOptions options={locked} />
      )}
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
