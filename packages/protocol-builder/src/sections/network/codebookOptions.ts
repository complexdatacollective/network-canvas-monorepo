import { useMemo } from 'react';

import type { Variables, VariableType } from '@codaco/protocol-validation';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  type WriterClass,
} from '../../codebook/variableRoles.ts';
import type { VariablePickerOption } from '../../fields/VariablePicker.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import {
  type CodebookSubject,
  type ProtocolBuilderProtocolContext,
  variablesForSubject,
} from '../../protocol-context.ts';

export type { WriterClass } from '../../codebook/variableRoles.ts';

/** One edge type, as a checkbox or radio option. */
export type EdgeTypeOption = Readonly<{ value: string; label: string }>;

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

const NO_OPTIONS: readonly VariablePickerOption[] = Object.freeze([]);
const NO_VARIABLES: Readonly<Variables> = Object.freeze({});

/**
 * The stage's subject, read from the draft.
 *
 * Every canvas section asks the same question — which node type is this stage
 * about — and answers it the same way: through the package's one draft-value
 * hook, so a subject only the committed draft holds (because the section
 * owning it has not been opened yet) still reaches the pickers.
 */
export function useStageSubject(): CodebookSubject | undefined {
  const raw = useStageValue('subject');
  return useMemo(() => readSubject(raw), [raw]);
}

/** A subject the codebook can be read against, or nothing. */
function readSubject(value: unknown): CodebookSubject | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entity = Reflect.get(value, 'entity');
  if (entity === 'ego') return { entity: 'ego' };
  if (entity !== 'node' && entity !== 'edge') return undefined;
  const type = Reflect.get(value, 'type');
  if (typeof type !== 'string' || type === '') return undefined;
  return entity === 'node'
    ? { entity: 'node', type }
    : { entity: 'edge', type };
}

/**
 * The subject's attributes of these types, as picker options.
 *
 * Ordered by name rather than by the order the codebook happens to hold them
 * in: a researcher looking for an attribute they authored months ago scans an
 * alphabetical list, and the codebook's own order is an artefact of when each
 * one was added.
 */
function variableOptions(
  context: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
  types: readonly VariableType[],
): VariablePickerOption[] {
  return Object.entries(variablesForSubject(context, subject))
    .filter(([, variable]) => types.includes(variable.type))
    .map(([id, variable]) => ({
      value: id,
      label: variable.name,
      type: variable.type,
    }))
    .toSorted(
      (first, second) =>
        first.label.localeCompare(second.label) ||
        first.value.localeCompare(second.value),
    );
}

/** Every edge type the protocol defines. */
function edgeTypeOptions(
  context: ProtocolBuilderProtocolContext,
): EdgeTypeOption[] {
  return Object.entries(context.codebook.edge ?? {})
    .map(([value, definition]) => ({ value, label: definition.name }))
    .toSorted(
      (first, second) =>
        first.label.localeCompare(second.label) ||
        first.value.localeCompare(second.value),
    );
}

export type VariableOptionQuery = Readonly<{
  /** Absent while the stage has no subject; the picker then offers nothing. */
  subject: CodebookSubject | undefined;
  types: readonly VariableType[];
  /**
   * Whether this picker's values go through the codebook's validation rules.
   *
   * A form field is a VALIDATED writer, so it may not share an attribute with
   * a bin, a highlight or a hull, which write around those rules — and the
   * other way round. Omitted where the exclusivity does not apply.
   */
  writerClass?: WriterClass;
  /**
   * What the field currently holds. Always offered back, whatever the filters
   * say: a picker that dropped its own value would blank the control and then
   * write the blank over the reference the researcher has to resolve.
   */
  currentValue?: string | readonly string[];
  /** The structural slot this picker IS, so its own claim does not exclude it. */
  ownSlot?: string;
}>;

/**
 * What one canvas picker may offer.
 *
 * The codebook, the roles every attribute already plays, and the structural
 * slots interfaces claim all come from the editor's own protocol context — so
 * an attribute a collaborator adds, renames or deletes while the editor is
 * open changes the list without this hook, or the section using it, doing
 * anything at all.
 */
export function useVariableOptions(
  query: VariableOptionQuery,
): readonly VariablePickerOption[] {
  const { protocolContext, identity } = useStageEditorForm();
  const { subject, types, writerClass, currentValue, ownSlot } = query;

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
    const typed = variableOptions(protocolContext, subject, types);
    const roleFiltered =
      writerClass === undefined
        ? typed
        : writerClass === 'validated'
          ? excludeUnvalidatedUses(roleMap, subject, typed, currentValue)
          : excludeValidatedUses(roleMap, subject, typed, currentValue);
    return Object.freeze(
      excludeInterfaceOwned(
        slotMap,
        subject,
        roleFiltered,
        currentValue,
        ownSlot,
      ),
    );
  }, [
    currentValue,
    ownSlot,
    protocolContext,
    roleMap,
    slotMap,
    subject,
    types,
    writerClass,
  ]);
}

/** The subject's attributes, as the codebook holds them. */
export function useSubjectVariables(
  subject: CodebookSubject | undefined,
): Readonly<Variables> {
  const { protocolContext } = useStageEditorForm();
  return useMemo(
    () =>
      subject === undefined
        ? NO_VARIABLES
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );
}

/** Every edge type the protocol defines, from the editor's own context. */
export function useEdgeTypeOptions(): readonly EdgeTypeOption[] {
  const { protocolContext } = useStageEditorForm();
  return useMemo(
    () => Object.freeze(edgeTypeOptions(protocolContext)),
    [protocolContext],
  );
}
