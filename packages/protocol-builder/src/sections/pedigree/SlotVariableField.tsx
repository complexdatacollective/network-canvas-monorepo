import { get } from 'es-toolkit/compat';
import { type ReactNode, useMemo, useRef } from 'react';

import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import type {
  VariableOption,
  Variables,
  VariableType,
} from '@codaco/protocol-validation';

import type { WriterClass } from '../../codebook/variableRoles.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import CreateVariableButton from './CreateVariableButton.tsx';
import { usePedigreeVariableIndexes } from './entityTypeReset.ts';
import {
  slotCrossClassIssue,
  slotPickerOptions,
  type SlotVariableOption,
} from './slotWiring.ts';

const NO_VARIABLES: Readonly<Variables> = Object.freeze({});

export type SlotVariableFieldProps = Readonly<{
  /** The slot's path in the stage document, e.g. `nodeConfig.egoVariable`. */
  name: string;
  label: string;
  hint: ReactNode;
  /** The type whose attributes this slot binds. `null` while none is chosen. */
  subject: CodebookSubject | null;
  /** The pool, already narrowed to what this slot can bind. */
  options: readonly SlotVariableOption[];
  writerClass: WriterClass;
  /** The interface slot this picker fills, if the schema names one. */
  ownSlot?: string;
  /**
   * Attributes this stage's own unsaved draft already claims in the OPPOSITE
   * writer class.
   */
  draftConflicting?: readonly string[];
  /** The attribute type a newly created attribute is given. */
  variableType: VariableType;
  /** The canonical value set the interface owns, seeded and locked. */
  lockedOptions?: readonly VariableOption[];
  /** Visible text and accessible name of the create control. */
  createLabel: string;
  createDescription: string;
  /** Said in place of the list when the codebook offers nothing usable. */
  emptyMessage: string;
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
  variableType,
  lockedOptions,
  createLabel,
  createDescription,
  emptyMessage,
}: SlotVariableFieldProps) {
  const { committedFields, protocolContext, storeApi } = useStageEditorForm();
  const { roleMap, slotMap } = usePedigreeVariableIndexes();
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

  const pickerOptions = useMemo(
    () =>
      slotPickerOptions({
        roleMap,
        slotMap,
        subject,
        options,
        ...(currentValue === undefined ? {} : { currentValue }),
        ...(ownSlot === undefined ? {} : { ownSlot }),
        writerClass,
      }),
    [currentValue, options, ownSlot, roleMap, slotMap, subject, writerClass],
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
    roleMap,
    slotMap,
    subject,
    committedValue,
    ownSlot,
    writerClass,
    draftConflicting,
    allVariables,
  });
  judgeAgainst.current = {
    roleMap,
    slotMap,
    subject,
    committedValue,
    ownSlot,
    writerClass,
    draftConflicting,
    allVariables,
  };

  const crossClassValidation = useMemo(
    () =>
      messageRuleValidation([
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
      <ProtocolField<typeof VariablePickerControl>
        name={name}
        component={VariablePickerControl}
        label={label}
        hint={hint}
        required
        options={pickerOptions}
        emptyMessage={emptyMessage}
        custom={crossClassValidation}
      />
      <CreateVariableButton
        subject={subject}
        variableType={variableType}
        {...(lockedOptions === undefined ? {} : { lockedOptions })}
        label={createLabel}
        description={createDescription}
        onCreated={(variableId) =>
          storeApi.getState().setFieldValue(name, variableId)
        }
      />
    </>
  );
}
