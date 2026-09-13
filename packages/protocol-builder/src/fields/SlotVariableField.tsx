import { get } from 'es-toolkit/compat';
import { useMemo, useRef } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import type {
  InterfaceOwnedOption,
  Variables,
  VariableType,
} from '@codaco/protocol-validation';

import CodebookVariableValidationSection from '../codebook/validation/CodebookVariableValidationSection.tsx';
import type { WriterClass } from '../codebook/variableRoles.ts';
import { usePedigreeVariableIndexes } from '../editors/family-pedigree/sections/entityTypeReset.ts';
import { pedigreeMessages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';
import {
  ruleOutValuesOutsideOwnedSet,
  slotCrossClassIssue,
  slotPickerOptions,
  type SlotVariableOption,
  unusableVariableIssue,
} from '../editors/family-pedigree/sections/slotWiring.ts';
import { REQUIRED } from '../form/requiredField.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { variablesForSubject } from '../protocol-context.ts';
import CreateVariableButton from '../sections/create-variable/CreateVariableButton.tsx';
import { useProtocolContext } from '../state/protocolContext.ts';
import VariablePickerField from './VariablePickerField.tsx';

const NO_VARIABLES: Readonly<Variables> = Object.freeze({});

export type SlotVariableFieldProps = Readonly<{
  /** The slot's path in the stage document, e.g. `nodeConfig.egoVariable`. */
  name: string;
  /**
   * What this slot is called, and what it is for.
   *
   * DESCRIPTORS throughout, because the words belong to the section that
   * mounts this rather than to the control: a string handed across this seam
   * is invisible to extraction, absent from the catalogs and covered by no
   * guard, so every word this component renders would be the words that stayed
   * English.
   */
  label: MessageDescriptor;
  hint: MessageDescriptor;
  /** The type whose attributes this slot binds. `null` while none is chosen. */
  subject: CodebookSubject | null;
  /**
   * The pool, already narrowed to the attribute TYPE this slot binds.
   *
   * Narrowing by VALUES is done here rather than by the section, because it
   * is not a narrowing: an attribute whose values have stopped matching
   * `lockedOptions` stays in the pool, ruled out and named for what is wrong
   * with it, so the one a slot already holds is still listed as held. See
   * `ruleOutValuesOutsideOwnedSet`.
   */
  options: readonly SlotVariableOption[];
  writerClass: WriterClass;
  /** The interface slot this picker fills, if the schema names one. */
  ownSlot?: string;
  /**
   * Attributes this stage's own unsaved draft already claims in the OPPOSITE
   * writer class.
   */
  draftConflicting?: readonly string[];
  /**
   * The attribute this stage's display label names right now, which no
   * structural slot may also write. See `slotWiring`'s own note.
   */
  draftLabelVariable?: string;
  /** The attribute type a newly created attribute is given. */
  variableType: VariableType;
  /**
   * The canonical value set the interface owns, seeded and locked.
   *
   * The picker, the create affordance and the save-time gate all read it: an
   * attribute whose values do not match it is ruled out of the picker, one
   * created here is seeded with it, and one the control is already holding is
   * refused at the save when its values stop matching it.
   */
  lockedOptions?: readonly InterfaceOwnedOption[];
  /** Visible text and accessible name of the create control. */
  createLabel: MessageDescriptor;
  /** Said in place of the list when the codebook offers nothing usable. */
  emptyMessage: MessageDescriptor;
  /**
   * Whether the chosen attribute's own rules are edited under this picker.
   *
   * Only the display label: it is the one slot the PARTICIPANT types into, so
   * its rules are what stand between them and a family member with no name,
   * and Architect mounts the rule section under exactly that picker
   * (`sections/FamilyPedigree/NodeConfiguration.tsx`). The structural slots
   * beside it are stamped by the interface, which no rule of the researcher's
   * governs.
   */
  offerValidation?: boolean;
}>;

/**
 * One attribute the pedigree binds: chosen from the codebook, or created.
 *
 * The picker, the save-time gate and the create affordance are one component
 * because they have to agree. A picker that offered an attribute the gate then
 * refuses reads as the editor changing its mind; a create affordance that
 * seeded a different type — or a different value set — from the one the slot
 * accepts would produce an attribute the picker immediately hides again.
 */
export default function SlotVariableField({
  name,
  label,
  hint,
  subject,
  options,
  writerClass,
  ownSlot,
  draftConflicting,
  draftLabelVariable,
  variableType,
  lockedOptions,
  createLabel,
  emptyMessage,
  offerValidation = false,
}: SlotVariableFieldProps) {
  const intl = useAppIntl();
  const { committedFields, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const { roleMap, slotMap, draftSlotMap } = usePedigreeVariableIndexes();
  const draftValue = useStageValue(name);
  const currentValue = typeof draftValue === 'string' ? draftValue : undefined;
  const committedValue: unknown = get(committedFields, name);

  const allVariables = useMemo(
    () =>
      subject === null
        ? NO_VARIABLES
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  // The picker is asked the SAME question as the gate below, `draftConflicting`
  // included: an attribute this stage's own draft already claims in the other
  // writer class is not on offer here, so the only pick that can reach the gate
  // is one this picker never made — a value that arrived with the protocol, or
  // one a slot was already holding when the conflicting field appeared.
  const valueCheckedOptions = useMemo(
    () =>
      lockedOptions === undefined
        ? options
        : ruleOutValuesOutsideOwnedSet(
            options,
            lockedOptions,
            (attributeName) => ({
              optionLabel: intl.formatMessage(
                pedigreeMessages.slotValuesChangedOptionLabel,
                { attributeName },
              ),
              note: intl.formatMessage(pedigreeMessages.slotValuesChangedNote),
            }),
          ),
    [intl, lockedOptions, options],
  );

  const pickerOptions = useMemo(
    () =>
      slotPickerOptions({
        roleMap,
        slotMap,
        subject,
        options: valueCheckedOptions,
        ...(currentValue === undefined ? {} : { currentValue }),
        ...(ownSlot === undefined ? {} : { ownSlot }),
        writerClass,
        ...(draftConflicting === undefined ? {} : { draftConflicting }),
        ...(draftLabelVariable === undefined ? {} : { draftLabelVariable }),
        draftSlotMap,
      }),
    [
      currentValue,
      draftConflicting,
      draftLabelVariable,
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
   * Everything the gate judges a pick against, kept live.
   *
   * The shared field registers its validation function once and memoises it on
   * a JSON of its validation props — which drops functions, so a rebuilt
   * closure would never replace the one registered on the first render. The
   * gate therefore reads through a ref, the way that field's own message
   * formatter does, and judges a pick against the draft as it stands when the
   * researcher saves rather than as it stood when the editor opened. Without
   * this, a form field added in this session would never refuse a structural
   * slot: the whole point of the draft half of the rule.
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
    draftLabelVariable,
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
    draftLabelVariable,
    allVariables,
  };

  const crossClassValidation = useMemo(
    () =>
      messageRuleValidation([
        // Asked first: an attribute that has been deleted or retyped under the
        // slot is not a conflict with another writer, it is a reference to
        // something that cannot hold what this slot writes — and saying so is
        // more use than naming whoever else was writing it.
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

  return (
    <>
      <Field<typeof VariablePickerField>
        name={name}
        component={VariablePickerField}
        label={intl.formatMessage(label)}
        hint={intl.formatMessage(hint)}
        required={REQUIRED}
        options={pickerOptions}
        emptyMessage={intl.formatMessage(emptyMessage)}
        custom={crossClassValidation}
      />
      <CreateVariableButton
        subject={subject}
        variableType={variableType}
        {...(lockedOptions === undefined ? {} : { lockedOptions })}
        label={intl.formatMessage(createLabel)}
        onCreated={(variableId) =>
          storeApi.getState().setFieldValue(name, variableId)
        }
      />
      {offerValidation && (
        <CodebookVariableValidationSection
          subject={subject ?? undefined}
          variableId={currentValue}
        />
      )}
    </>
  );
}
