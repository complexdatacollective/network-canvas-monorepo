import { get, isEqual } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef } from 'react';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  type ExclusiveVariableSlotMap,
  type VariableRoleMap,
} from '../../codebook/variableRoles.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  useClearStageValue,
  useStageValue,
} from '../../form/stageFormHooks.ts';

/**
 * The two indexes every pedigree picker asks about a pick: which attributes an
 * interface slot already owns, and which writer class already claims one.
 *
 * Built from the editor's own protocol context, so they follow a collaborator's
 * change without anything here re-fetching. Deliberately NOT scoped to exclude
 * the stage being edited: the pedigree's own saved slots are exactly what makes
 * a second slot's pick a conflict, and each picker escapes its own committed
 * value instead.
 */
export function usePedigreeVariableIndexes(): Readonly<{
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
}> {
  const { protocolContext } = useStageEditorForm();
  return useMemo(
    () => ({
      roleMap: buildVariableRoleMap(protocolContext),
      slotMap: buildExclusiveVariableSlotMap(protocolContext),
    }),
    [protocolContext],
  );
}

/**
 * Throws away everything that described the previous type when a pedigree's
 * node or edge type changes.
 *
 * The pedigree names its types on `nodeConfig.type` and `edgeConfig.type`
 * rather than on a stage `subject`, so the shared subject reset has nothing to
 * watch here — but the consequence is identical: an attribute reference means
 * nothing against a different type, and a stage saved still holding one points
 * at attributes that type does not have.
 *
 * An observer effect rather than an `onChange` handler, because a caller's
 * `onChange` on a Fresco field REPLACES the store's own write rather than
 * running beside it.
 *
 * A researcher picking a different type is told apart from the draft moving
 * beneath the form — an undo, a redo, a collaborator's change — by watching the
 * AGREED draft as well as the form. Those arrive carrying the configuration
 * that belongs to the type they bring with them, and clearing there would wipe
 * the half of the change the researcher was reaching for.
 */
export function useResetOnEntityTypeChange(
  typePath: string,
  dependentPaths: readonly string[],
): void {
  const { committedFields } = useStageEditorForm();
  const typeValue = useStageValue(typePath);
  const clearStageValue = useClearStageValue();
  const committedType: unknown = get(committedFields, typePath);

  const seenType = useRef(typeValue);
  const seenCommittedType = useRef(committedType);
  const awaitingReseedTo = useRef<{ value: unknown } | null>(null);
  // The paths themselves, not the array carrying them: a section that spells
  // its list inline hands over a new array on every render.
  const key = JSON.stringify(dependentPaths);
  const latestPaths = useRef(dependentPaths);
  latestPaths.current = dependentPaths;

  useEffect(() => {
    const previousType = seenType.current;
    seenType.current = typeValue;
    const previousCommitted = seenCommittedType.current;
    seenCommittedType.current = committedType;

    if (!isEqual(previousCommitted, committedType)) {
      awaitingReseedTo.current = { value: committedType };
    }

    // The first type a stage is given has nothing to clear: there was no
    // previous type for its attributes to belong to.
    if (previousType === undefined || isEqual(previousType, typeValue)) return;

    const expected = awaitingReseedTo.current;
    awaitingReseedTo.current = null;
    if (expected !== null && isEqual(expected.value, typeValue)) return;

    for (const path of latestPaths.current) clearStageValue(path);
  }, [clearStageValue, committedType, key, typeValue]);
}
