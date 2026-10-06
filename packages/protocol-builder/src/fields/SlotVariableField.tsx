import { get } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import {
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOptionSetKey,
  type Variables,
  type VariableType,
} from '@codaco/protocol-validation';

import CodebookVariableValidationSection from '../codebook/validation/CodebookVariableValidationSection.tsx';
import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  type ExclusiveVariableSlotMap,
  type WriterClass,
} from '../codebook/variableRoles.ts';
import { REQUIRED } from '../form/requiredField.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { variablesForSubject } from '../protocol-context.ts';
import { useCreateAttributeForSlot } from '../sections/create-variable/useCreateAttributeForSlot.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { slotVariableMessages } from './slotVariableMessages.ts';
import {
  ruleOutValuesOutsideOwnedSet,
  slotCrossClassIssue,
  slotPickerOptions,
  subjectVariableOptions,
  unusableVariableIssue,
} from './slotVariableWiring.ts';
import VariablePickerField from './VariablePickerField.tsx';

const NO_VARIABLES: Readonly<Variables> = Object.freeze({});
const NO_CLAIMS: ExclusiveVariableSlotMap = Object.freeze({});

export type SlotVariableFieldProps = Readonly<{
  /** The slot's path in the stage document, e.g. `nodeConfiguration.egoVariable`. */
  name: string;
  /**
   * What this slot is called, and what it is for. Descriptors, because the
   * words belong to the section that mounts this control.
   */
  label: MessageDescriptor;
  hint: MessageDescriptor;
  /** Titles the codebook editor a create escalates to. */
  createLabel: MessageDescriptor;
  /** The type whose attributes this slot binds. `null` while none is chosen. */
  subject: CodebookSubject | null;
  /** The attribute type this slot binds, and the type a created one is given. */
  variableType: VariableType;
  /**
   * Whether the interface collects this attribute from the participant through
   * a validated control (`validated`) or writes it itself (`unvalidated`).
   */
  writerClass: WriterClass;
  /**
   * The exclusive interface slot this picker fills, where the schema declares
   * the slot exclusive. Keeps an attribute bound to the SAME slot elsewhere on
   * offer, and refuses one any other exclusive slot claims.
   */
  ownSlot?: string;
  /**
   * The value set the interface owns for this slot. An attribute whose values
   * differ is ruled out of the picker and refused at save, and one created here
   * is seeded with exactly this set, locked.
   */
  ownedOptions?: InterfaceOwnedOptionSetKey;
  /**
   * Attributes this stage's own unsaved draft already claims in the OPPOSITE
   * writer class.
   */
  draftConflicting?: readonly string[];
  /** Exclusive claims this stage's own unsaved draft has made. */
  draftSlotMap?: ExclusiveVariableSlotMap;
  /**
   * Edit the chosen attribute's own validation rules under the picker. For a
   * slot whose value the participant types.
   */
  offerValidation?: boolean;
}>;

/**
 * One attribute an interface binds to a slot of its own: chosen from the
 * codebook, or created from the picker.
 *
 * The picker, the save-time gate and the create affordance are one component
 * because they have to agree: a picker offering what the gate refuses reads as
 * the editor changing its mind, and a create seeding a different type or value
 * set would produce an attribute the picker immediately hides again.
 */
export default function SlotVariableField({
  name,
  label,
  hint,
  createLabel,
  subject,
  variableType,
  writerClass,
  ownSlot,
  ownedOptions,
  draftConflicting,
  draftSlotMap = NO_CLAIMS,
  offerValidation = false,
}: SlotVariableFieldProps) {
  const intl = useAppIntl();
  const { committedFields, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const draftValue = useStageValue(name);
  const currentValue = typeof draftValue === 'string' ? draftValue : undefined;
  const committedValue: unknown = get(committedFields, name);
  const lockedOptions =
    ownedOptions === undefined
      ? undefined
      : INTERFACE_OWNED_OPTION_SETS[ownedOptions].options;

  const { createProps, editor } = useCreateAttributeForSlot({
    subject,
    variableType,
    ...(lockedOptions === undefined ? {} : { lockedOptions }),
    title: intl.formatMessage(createLabel),
    onCreated: (variableId) =>
      storeApi.getState().setFieldValue(name, variableId),
  });

  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext),
    [protocolContext],
  );
  const slotMap = useMemo(
    () => buildExclusiveVariableSlotMap(protocolContext),
    [protocolContext],
  );

  const allVariables = useMemo(
    () =>
      subject === null
        ? NO_VARIABLES
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const pool = useMemo(
    () => subjectVariableOptions(protocolContext, subject, variableType),
    [protocolContext, subject, variableType],
  );

  const valueCheckedOptions = useMemo(
    () =>
      lockedOptions === undefined
        ? pool
        : ruleOutValuesOutsideOwnedSet(
            pool,
            lockedOptions,
            (attributeName) => ({
              optionLabel: intl.formatMessage(
                slotVariableMessages.valuesChangedOptionLabel,
                { attributeName },
              ),
              note: intl.formatMessage(slotVariableMessages.valuesChangedNote),
            }),
          ),
    [intl, lockedOptions, pool],
  );

  const pickerOptions = useMemo(
    () =>
      slotPickerOptions({
        roleMap,
        slotMap,
        draftSlotMap,
        subject,
        options: valueCheckedOptions,
        ...(currentValue === undefined ? {} : { currentValue }),
        ...(ownSlot === undefined ? {} : { ownSlot }),
        writerClass,
        ...(draftConflicting === undefined ? {} : { draftConflicting }),
      }),
    [
      currentValue,
      draftConflicting,
      draftSlotMap,
      ownSlot,
      roleMap,
      slotMap,
      subject,
      valueCheckedOptions,
      writerClass,
    ],
  );

  /**
   * Everything the gate judges a pick against, kept live. The shared field
   * memoises its validation on a JSON of its props, which drops functions, so
   * the gate reads through a ref and judges the draft as it stands at save.
   */
  const judgeAgainst = useRef({
    variableType,
    lockedOptions,
    roleMap,
    slotMap,
    draftSlotMap,
    subject,
    committedValue,
    ownSlot,
    writerClass,
    draftConflicting,
    allVariables,
  });
  judgeAgainst.current = {
    variableType,
    lockedOptions,
    roleMap,
    slotMap,
    draftSlotMap,
    subject,
    committedValue,
    ownSlot,
    writerClass,
    draftConflicting,
    allVariables,
  };

  const slotValidation = useMemo(
    () =>
      messageRuleValidation([
        // Asked first: an attribute deleted or retyped under the slot is not a
        // conflict with another writer, and saying so is more use.
        (value: unknown) =>
          unusableVariableIssue(
            judgeAgainst.current.allVariables,
            value,
            judgeAgainst.current.variableType,
            judgeAgainst.current.lockedOptions,
          ),
        (value: unknown) =>
          slotCrossClassIssue({
            ...judgeAgainst.current,
            variableId: value,
          }),
      ]),
    [],
  );

  // A codebook change can make (or unmake) a standing error true; re-judge a
  // field that is already showing one.
  useEffect(() => {
    const state = storeApi.getState();
    if (state.getFieldErrors(name) === null) return;
    void state.validateField(name);
  }, [allVariables, name, storeApi]);

  return (
    <>
      <Field<typeof VariablePickerField>
        name={name}
        component={VariablePickerField}
        label={intl.formatMessage(label)}
        hint={intl.formatMessage(hint)}
        required={REQUIRED}
        options={pickerOptions}
        emptyMessage={intl.formatMessage(slotVariableMessages.emptyState)}
        custom={slotValidation}
        {...createProps}
      />
      {editor}
      {offerValidation && (
        <CodebookVariableValidationSection
          subject={subject ?? undefined}
          variableId={currentValue}
        />
      )}
    </>
  );
}
