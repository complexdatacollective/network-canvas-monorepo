import { useMemo } from 'react';

import type { VariableType } from '@codaco/protocol-validation';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeValidatedUses,
} from '../../codebook/variableRoles.ts';
import type { VariablePickerOption } from '../../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';

/** One edge type, as a tick box or a radio option. */
export type EdgeTypeChoice = Readonly<{ value: string; label: string }>;

/**
 * The attribute types each canvas picker offers, spelled once.
 *
 * Module-level and frozen because a picker's option list is memoised on the
 * type list it was asked for, and an array literal written at a call site is a
 * new one on every render.
 */
export const LAYOUT_TYPES: readonly VariableType[] = Object.freeze(['layout']);
export const BOOLEAN_TYPES: readonly VariableType[] = Object.freeze([
  'boolean',
]);
export const CATEGORICAL_TYPES: readonly VariableType[] = Object.freeze([
  'categorical',
]);

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
   * Whether the interview WRITES this attribute around the codebook's
   * validation rules — a tap that marks a node does — in which case it may not
   * share the attribute with a form field, which collects it through them.
   *
   * `false` for a picker that only reads: a preset positions, groups and
   * highlights BY attributes, so one a form collects is exactly what it exists
   * to look at.
   */
  unvalidatedWriter?: boolean;
  /**
   * What the field currently holds. Always offered back, whatever the filters
   * say: a picker that dropped its own value would blank the control and then
   * write the blank over the reference the researcher has to resolve.
   */
  currentValue?: string | readonly string[];
}>;

/**
 * What one canvas picker may offer.
 *
 * The codebook, the roles every attribute already plays and the structural
 * slots other interfaces claim are all read from the protocol here, so an
 * attribute a collaborator adds, renames or deletes while the editor is open
 * changes the list without the section using this doing anything.
 *
 * Ordered by name rather than by the order the codebook happens to hold them
 * in: a researcher looking for an attribute they authored months ago scans an
 * alphabetical list.
 */
export function useVariableChoices(
  query: VariableChoiceQuery,
): readonly VariablePickerOption[] {
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const { subject, types, unvalidatedWriter = false, currentValue } = query;

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
    const typed = Object.entries(variablesForSubject(protocolContext, subject))
      .filter(([, variable]) => types.includes(variable.type))
      .map(([value, variable]) => ({
        value,
        label: variable.name,
        type: variable.type,
      }))
      .toSorted(byLabel);
    const roleFiltered = unvalidatedWriter
      ? excludeValidatedUses(roleMap, subject, typed, currentValue)
      : typed;
    return Object.freeze(
      excludeInterfaceOwned(slotMap, subject, roleFiltered, currentValue),
    );
  }, [
    currentValue,
    protocolContext,
    roleMap,
    slotMap,
    subject,
    types,
    unvalidatedWriter,
  ]);
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
