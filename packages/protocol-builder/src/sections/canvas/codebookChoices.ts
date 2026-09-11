import { useMemo } from 'react';

import type { VariableType } from '@codaco/protocol-validation';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  type WriterClass,
} from '../../codebook/variableRoles.ts';
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
export const LAYOUT_TYPE = 'layout';
export const BOOLEAN_TYPE = 'boolean';
export const CATEGORICAL_TYPE = 'categorical';
export const TEXT_TYPE = 'text';
export const LAYOUT_TYPES: readonly VariableType[] = Object.freeze([
  LAYOUT_TYPE,
]);
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
const NO_NAMES: readonly string[] = Object.freeze([]);

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
   * What the field currently holds. Always offered back, whatever the filters
   * say: a picker that dropped its own value would blank the control and then
   * write the blank over the reference the researcher has to resolve.
   *
   * A LIST where the control holds one — a tick list of highlight attributes
   * keeps every attribute it has ticked, for the same reason a select keeps
   * the one it has chosen.
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
 * An attribute a form field collects is offered only to a picker that READS it
 * or collects it the same way. A sociogram prompt names attributes the
 * interview writes around the codebook's validation rules — a position the
 * participant drags a node to, a mark a tap toggles — and two writers would
 * disagree about whether the value was checked; a narrative preset writes
 * nothing at all, so `writerClass` says which of the three this picker is.
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
  const { subject, types, writerClass, currentValue } = query;

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
    const roleFiltered =
      writerClass === 'unvalidated'
        ? excludeValidatedUses(roleMap, subject, typed, currentValue)
        : writerClass === 'validated'
          ? excludeUnvalidatedUses(roleMap, subject, typed, currentValue)
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
    writerClass,
  ]);
}

/**
 * Every attribute name one type already holds, whatever kind of answer it is.
 *
 * Wider than `useVariableChoices` on purpose. That narrows to what a control
 * can USE; this answers what the codebook would refuse, and a name is taken by
 * a date attribute just as firmly as by a text one. A picker offering to
 * create an attribute checks the name it was given against this before asking,
 * so a duplicate is said on the row the researcher typed into rather than
 * coming back from a round trip.
 */
export function useSubjectVariableNames(
  subject: CodebookSubject | undefined,
): readonly string[] {
  const protocolContext = useProtocolContext();
  return useMemo(() => {
    if (subject === undefined) return NO_NAMES;
    return Object.freeze(
      Object.values(variablesForSubject(protocolContext, subject)).map(
        (variable) => variable.name,
      ),
    );
  }, [protocolContext, subject]);
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
