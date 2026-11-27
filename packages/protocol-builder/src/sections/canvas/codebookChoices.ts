import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { VariableType } from '@codaco/protocol-validation';

import {
  attributeChoices,
  formCannotCollectReason,
  markCrossClassUses,
  markInterfaceOwned,
  onlyTypesReason,
} from '../../codebook/attributeAvailability.ts';
import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  type WriterClass,
} from '../../codebook/variableRoles.ts';
import {
  variableNameScope,
  type VariableNameScope,
} from '../../fields/variableNameRules.ts';
import type { VariablePickerOption } from '../../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import { TYPE_OPTIONS } from '../collectableTypes.ts';

/** One edge type, as a tick box or a radio option. */
export type EdgeTypeChoice = Readonly<{ value: string; label: string }>;

/**
 * The attribute types each canvas picker offers, spelled once.
 *
 * Module-level and frozen because a picker's option list is memoised on the
 * type list it was asked for, and an array literal written at a call site is a
 * new one on every render.
 */
export const BOOLEAN_TYPE = 'boolean';
export const CATEGORICAL_TYPE = 'categorical';
export const TEXT_TYPE = 'text';
export const BOOLEAN_TYPES: readonly VariableType[] = Object.freeze([
  BOOLEAN_TYPE,
]);
export const CATEGORICAL_TYPES: readonly VariableType[] = Object.freeze([
  CATEGORICAL_TYPE,
]);
export const TEXT_TYPES: readonly VariableType[] = Object.freeze([TEXT_TYPE]);

/**
 * Every kind of answer a form can ask for, which is the pool a form field's
 * picker draws from rather than one named type.
 *
 * Derived from the shared list of collectable types rather than written out,
 * so an attribute type the schema teaches a control to render is offered here
 * the day it gains one.
 */
export const COLLECTABLE_TYPES: readonly VariableType[] = Object.freeze(
  TYPE_OPTIONS.map(({ value }) => value),
);

const NO_OPTIONS: readonly VariablePickerOption[] = Object.freeze([]);
const NO_EDGE_TYPES: readonly EdgeTypeChoice[] = Object.freeze([]);

const byLabel = <T extends Readonly<{ value: string; label: string }>>(
  first: T,
  second: T,
): number =>
  first.label.localeCompare(second.label) ||
  first.value.localeCompare(second.value);

export type VariableChoiceQuery = Readonly<{
  /** Absent while the stage has no subject; the picker then offers nothing. */
  subject: CodebookSubject | undefined;
  types: readonly VariableType[];
  /**
   * Set by a form field's picker, so an attribute of a type outside `types`
   * is described as one a form cannot collect rather than as the wrong type.
   */
  forFormField?: boolean;
  /**
   * What the interview does with this attribute through the control being
   * offered, which decides what the control may not be pointed at.
   *
   * `'unvalidated'` writes it around the codebook's validation rules — a tap
   * that marks a node, a position a node is dragged to — so it may not share
   * the attribute with anything that collects it through those rules.
   * `'validated'` collects it through them — a quick-add box, a form field —
   * so it may not share the attribute with an unvalidated writer either;
   * an export would otherwise mix checked and unchecked answers under one
   * name.
   *
   * Absent is a picker that only READS: a narrative preset positions, groups
   * and highlights BY attributes, so one a form collects is exactly what it
   * exists to look at. Classed as a writer, the filter dropped precisely those.
   */
  writerClass?: WriterClass;
  /**
   * What the field currently holds. Never marked unavailable by a rule about
   * where else the attribute is used: the save lets the committed value
   * through, so a stage that arrives already breaking one of those rules stays
   * editable. An attribute held that is of the wrong TYPE is still marked,
   * because nothing can be recorded in it here.
   *
   * A LIST where the control holds one — a tick list of highlight attributes
   * keeps every attribute it has ticked, for the same reason a select keeps
   * the one it has chosen.
   */
  currentValue?: string | readonly string[];
}>;

/**
 * What one canvas picker lists: every attribute of the subject, with the ones
 * it cannot use marked with the reason (see `attributeAvailability.ts`).
 *
 * The codebook, the roles every attribute already plays and the structural
 * slots other interfaces claim are all read from the protocol here, so an
 * attribute a collaborator adds, renames or deletes while the editor is open
 * changes the list without the section using this doing anything.
 *
 * An attribute of another type than `types` is marked for its type. A picker
 * that needs one type says "Only Layout attributes can be used here."; the
 * one picker that takes several, a form field's, says which types a form
 * cannot collect.
 *
 * An attribute a form field collects is marked for a picker that WRITES it
 * without validation, and the other way round. A sociogram prompt names
 * attributes the interview writes around the codebook's validation rules — a
 * position the participant drags a node to, a mark a tap toggles — and two
 * writers would disagree about whether the value was checked; a narrative
 * preset writes nothing at all, so `writerClass` says which of the three this
 * picker is.
 *
 * Something that is not a picker — a tick list, a check of whether a stored
 * reference is still usable — reads only the options that can be chosen,
 * through `availableOnly`.
 */
export function useVariableChoices(
  query: VariableChoiceQuery,
): readonly VariablePickerOption[] {
  const intl = useAppIntl();
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const { subject, types, forFormField, writerClass, currentValue } = query;

  // This stage's own committed uses are excluded from the role map: the
  // attribute a picker is already holding is claimed BY this picker, and
  // counting that claim would make the stage refuse to re-save itself.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );
  const slotMap = useMemo(
    () => buildExclusiveVariableSlotMap(protocolContext),
    [protocolContext],
  );

  return useMemo(() => {
    if (subject === undefined) return NO_OPTIONS;
    const typed = attributeChoices(
      variablesForSubject(protocolContext, subject),
      (type) => types.includes(type),
      forFormField === true
        ? formCannotCollectReason(intl)
        : onlyTypesReason(intl, types),
    );
    // Neither rule applies to a picker that only reads. An attribute another
    // interface owns — a pedigree's ego marker — is exactly what a reading
    // picker exists to look at: a narrative preset highlights by it, groups
    // by it, positions by it, and writes nothing back. Interface ownership
    // comes first, as it does in the save-time gates.
    if (writerClass === undefined) return Object.freeze(typed);
    const owned = markInterfaceOwned(
      slotMap,
      subject,
      typed,
      intl,
      currentValue,
    );
    return Object.freeze(
      markCrossClassUses(
        roleMap,
        subject,
        owned,
        writerClass,
        intl,
        currentValue,
      ),
    );
  }, [
    currentValue,
    forFormField,
    intl,
    protocolContext,
    roleMap,
    slotMap,
    subject,
    types,
    writerClass,
  ]);
}

/**
 * Every attribute one type already holds, whatever kind of answer it is, as far
 * as a name has to be judged against them.
 *
 * Wider than `useVariableChoices` on purpose. That narrows to what a control
 * can USE; this answers what the codebook would refuse, and a name is taken by
 * a date attribute just as firmly as by a text one — and one attribute's
 * export columns can be taken by another's. A picker offering to create an
 * attribute checks the name it was given against this before asking, so a
 * refusal is said on the row the researcher typed into rather than coming back
 * from a round trip.
 */
export function useSubjectVariableScope(
  subject: CodebookSubject | undefined,
): VariableNameScope | undefined {
  const protocolContext = useProtocolContext();
  return useMemo(
    () =>
      subject === undefined
        ? undefined
        : variableNameScope(
            subject.entity,
            variablesForSubject(protocolContext, subject),
            protocolContext.codebook.layouts,
          ),
    [protocolContext, subject],
  );
}

/** Every edge type the protocol defines, read live. */
export function useEdgeTypeChoices(): readonly EdgeTypeChoice[] {
  const protocolContext = useProtocolContext();
  return useMemo(() => {
    const edges = protocolContext.codebook.edge;
    if (edges === undefined) return NO_EDGE_TYPES;
    return Object.freeze(
      Object.entries(edges)
        .map(([value, definition]) => ({ value, label: definition.name }))
        .toSorted(byLabel),
    );
  }, [protocolContext]);
}
