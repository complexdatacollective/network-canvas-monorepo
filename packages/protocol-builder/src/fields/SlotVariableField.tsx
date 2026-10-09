import { get } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import {
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOptionSetKey,
  isSuppliedOptionLabelSet,
  suppliedOptionLabels,
  type VariableOption,
  type Variables,
  type VariableType,
} from '@codaco/protocol-validation';

import type {
  OptionRowChoiceValue,
  VariableEditorHostOptions,
} from '../codebook/optionRowChoice.ts';
import CodebookVariableValidationSection from '../codebook/validation/CodebookVariableValidationSection.tsx';
import {
  buildExclusiveVariableSlotMap,
  buildStageManagedOptionMap,
  buildVariableRoleMap,
  type ExclusiveVariableSlotMap,
  quotedLabels,
  stageManagersElsewhere,
  type WriterClass,
} from '../codebook/variableRoles.ts';
import { REQUIRED } from '../form/requiredField.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import { localizedFromText } from '../localization/localizedText.ts';
import { useProtocolLocalization } from '../localization/ProtocolLocalization.tsx';
import type { CodebookSubject } from '../protocol-context.ts';
import { variablesForSubject } from '../protocol-context.ts';
import { useCreateAttributeForSlot } from '../sections/create-variable/useCreateAttributeForSlot.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { slotVariableMessages } from './slotVariableMessages.ts';
import {
  managedElsewhereIssue,
  ruleOutOptionsManagedElsewhere,
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
  /** The slot's path in the stage document, e.g. `nodeConfiguration.egoAttribute`. */
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
   * The label a created attribute's option takes, by value, for an owned set
   * whose values carry no label of their own: words from the researcher's
   * translations rather than English defaults. An owned value with a label of
   * its own is seeded with that.
   */
  ownedOptionLabel?: (value: string) => string;
  /**
   * Options a created attribute starts with, for a slot whose interface
   * suggests a list but does not own it: unlike `ownedOptions`, the researcher
   * may edit, add to and remove from them, and an existing attribute with other
   * options is still offered.
   */
  seedOptions?: readonly VariableOption[];
  /**
   * Passed on to the codebook's editor when a create escalates to it: a type
   * shown rather than offered, or a choice of the host's own on every option
   * row (`VariableEditorHostOptions`).
   */
  editorOptions?: VariableEditorHostOptions;
  /**
   * Told which attribute a create from this picker bound to the slot, with the
   * choice made on each of its options' rows when `editorOptions` asked for
   * one.
   */
  onCreated?: (
    variableId: string,
    optionRowChoices?: readonly OptionRowChoiceValue[],
  ) => void;
  /**
   * Told which existing attribute the researcher chose from the picker, when
   * that replaces what the slot held. Not called for the attribute the slot
   * already holds, for a saved stage opening, or for a create (that is
   * `onCreated`), so it is the place to set what follows a binding.
   */
  onBound?: (variableId: string) => void;
  /**
   * Attributes this stage's own unsaved draft already claims in the OPPOSITE
   * writer class.
   */
  draftConflicting?: readonly string[];
  /**
   * Attributes this stage's own draft already binds to its OTHER answers, in
   * either writer class: ruled out of the picker and refused at save, so no
   * two of a stage's answers share an attribute.
   */
  draftBoundElsewhere?: readonly string[];
  /** Exclusive claims this stage's own unsaved draft has made. */
  draftSlotMap?: ExclusiveVariableSlotMap;
  /**
   * Edit the chosen attribute's own validation rules under the picker. For a
   * slot whose value the participant types.
   */
  offerValidation?: boolean;
  /**
   * This slot's stage manages the options of the attribute it binds (see
   * `StageManagedOptionsDescriptor`). Only one stage may, so an attribute
   * whose options another saved stage manages is ruled out of the picker and
   * refused at save.
   */
  managesOptions?: boolean;
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
  ownedOptionLabel,
  seedOptions,
  editorOptions,
  onCreated,
  onBound,
  draftConflicting,
  draftBoundElsewhere,
  draftSlotMap = NO_CLAIMS,
  offerValidation = false,
  managesOptions = false,
}: SlotVariableFieldProps) {
  const intl = useAppIntl();
  const { committedFields, storeApi, identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const draftValue = useStageValue(name);
  const currentValue = typeof draftValue === 'string' ? draftValue : undefined;
  const committedValue: unknown = get(committedFields, name);
  const lockedOptions =
    ownedOptions === undefined
      ? undefined
      : INTERFACE_OWNED_OPTION_SETS[ownedOptions].options;

  const localization = useProtocolLocalization();
  // A set whose labels a participant reads is seeded with the labels Network
  // Canvas supplies, in every protocol language that has them. Any other
  // canonical set's labels are plain text (or, for a set without labels of its
  // own, the host's translated words), held as participant copy in the
  // protocol's default language. Until the protocol's languages are known
  // they cannot be written, so creating an attribute for an owned set is not
  // offered.
  const seededOptions = useMemo<readonly VariableOption[] | undefined>(
    () =>
      lockedOptions === undefined ||
      ownedOptions === undefined ||
      localization === undefined
        ? undefined
        : lockedOptions.map((option) => ({
            value: option.value,
            label: isSuppliedOptionLabelSet(ownedOptions)
              ? suppliedOptionLabels(ownedOptions, option.value, localization)
              : localizedFromText(
                  localization,
                  option.label ??
                    ownedOptionLabel?.(option.value) ??
                    option.value,
                ),
          })),
    [localization, lockedOptions, ownedOptions, ownedOptionLabel],
  );
  const createOffered =
    lockedOptions === undefined || seededOptions !== undefined;
  const { createProps, editor } = useCreateAttributeForSlot({
    subject,
    variableType,
    ...(seededOptions === undefined ? {} : { lockedOptions: seededOptions }),
    ...(seedOptions === undefined ? {} : { seedOptions }),
    title: intl.formatMessage(createLabel),
    ...(editorOptions === undefined ? {} : { editorOptions }),
    onCreated: (variableId, optionRowChoices) => {
      storeApi.getState().setFieldValue(name, variableId);
      onCreated?.(variableId, optionRowChoices);
    },
  });

  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext),
    [protocolContext],
  );
  const slotMap = useMemo(
    () => buildExclusiveVariableSlotMap(protocolContext),
    [protocolContext],
  );

  // The labels of the other saved stages that manage an attribute's options,
  // for a slot whose stage manages them: none for any other slot.
  const managedOptionMap = useMemo(
    () =>
      managesOptions ? buildStageManagedOptionMap(protocolContext) : undefined,
    [managesOptions, protocolContext],
  );
  const managersElsewhere = useMemo(
    () =>
      (variableId: string): readonly string[] =>
        managedOptionMap === undefined || subject === null
          ? []
          : stageManagersElsewhere(
              managedOptionMap,
              subject,
              variableId,
              identity.id,
            ),
    [identity.id, managedOptionMap, subject],
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

  const managedCheckedOptions = useMemo(
    () =>
      ruleOutOptionsManagedElsewhere(
        valueCheckedOptions,
        managersElsewhere,
        (attributeName, stageLabels) => ({
          optionLabel: intl.formatMessage(
            slotVariableMessages.managedElsewhereOptionLabel,
            { attributeName },
          ),
          note: intl.formatMessage(slotVariableMessages.managedElsewhereNote, {
            count: stageLabels.length,
            stageLabels: quotedLabels(stageLabels),
          }),
        }),
      ),
    [intl, managersElsewhere, valueCheckedOptions],
  );

  const pickerOptions = useMemo(
    () =>
      slotPickerOptions({
        roleMap,
        slotMap,
        draftSlotMap,
        subject,
        options: managedCheckedOptions,
        ...(currentValue === undefined ? {} : { currentValue }),
        ...(ownSlot === undefined ? {} : { ownSlot }),
        writerClass,
        ...(draftConflicting === undefined ? {} : { draftConflicting }),
        ...(draftBoundElsewhere === undefined ? {} : { draftBoundElsewhere }),
      }),
    [
      currentValue,
      draftBoundElsewhere,
      draftConflicting,
      draftSlotMap,
      ownSlot,
      roleMap,
      slotMap,
      subject,
      managedCheckedOptions,
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
    draftBoundElsewhere,
    allVariables,
    managersElsewhere,
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
    draftBoundElsewhere,
    allVariables,
    managersElsewhere,
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
        // No committed-value escape: the protocol refuses a second stage
        // managing the options, however long it has held the attribute.
        (value: unknown) =>
          managedElsewhereIssue(
            judgeAgainst.current.allVariables,
            value,
            judgeAgainst.current.managersElsewhere,
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
        {...(onBound === undefined
          ? {}
          : {
              onSelectExisting: (variableId: string) => {
                if (variableId !== currentValue) onBound(variableId);
              },
            })}
        {...(createOffered ? createProps : {})}
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
