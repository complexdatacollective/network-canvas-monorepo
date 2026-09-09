import { useCallback, useMemo, useRef } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  type ExclusiveVariableSlotMap,
  type VariableRoleMap,
} from '../../codebook/variableRoles.ts';
import type { EntityTypeChangeConfirmation } from '../../fields/EntitySelectField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  useAskStageHasAnyValue,
  useDiscardStageValues,
  useStageValue,
} from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { useOnResearcherChange } from '../researcherChange.ts';
import {
  draftExclusiveSlotClaims,
  PEDIGREE_EXCLUSIVE_SLOTS,
} from './slotWiring.ts';

const NODE_TYPE_PATH = 'nodeConfig.type';
const EDGE_TYPE_PATH = 'edgeConfig.type';

/** The type a live slot pick names an attribute of, while one is chosen. */
const subjectOf = (
  entity: 'node' | 'edge',
  type: unknown,
): CodebookSubject | null =>
  typeof type === 'string' ? { entity, type } : null;

/**
 * The two indexes every pedigree picker asks about a pick: which attributes an
 * interface slot already owns, and which writer class already claims one.
 *
 * Built from the editor's own protocol context, so they follow a collaborator's
 * change without anything here re-fetching. Deliberately NOT scoped to exclude
 * the stage being edited: the pedigree's own saved slots are exactly what makes
 * a second slot's pick a conflict, and each picker escapes its own committed
 * value instead.
 *
 * A THIRD index goes with them: the slot claims the researcher has made in
 * this unsaved edit, which no protocol carries yet. Two exclusive slots taking
 * one attribute in a single session — the pedigree has two that each accept
 * any boolean of the edge type — passed both pickers and both gates, and the
 * protocol refused the whole stage at the save.
 *
 * Kept apart from the saved claims rather than merged into them so that a
 * refusal can say which it is, and so that a more specific refusal about the
 * same pick still wins: see `slotCrossClassIssue`, which consults them in
 * order, and `draftExclusiveSlotClaims`, where the live claims are shaped.
 */
export function usePedigreeVariableIndexes(): Readonly<{
  roleMap: VariableRoleMap;
  slotMap: ExclusiveVariableSlotMap;
  draftSlotMap: ExclusiveVariableSlotMap;
}> {
  const { protocolContext } = useStageEditorForm();
  const nodeType = useStageValue(NODE_TYPE_PATH);
  const edgeType = useStageValue(EDGE_TYPE_PATH);
  const ego = useStageValue(PEDIGREE_EXCLUSIVE_SLOTS.egoVariable.path);
  const relationship = useStageValue(
    PEDIGREE_EXCLUSIVE_SLOTS.relationshipVariable.path,
  );
  const relationshipType = useStageValue(
    PEDIGREE_EXCLUSIVE_SLOTS.relationshipTypeVariable.path,
  );
  const isActive = useStageValue(
    PEDIGREE_EXCLUSIVE_SLOTS.isActiveVariable.path,
  );
  const isGestationalCarrier = useStageValue(
    PEDIGREE_EXCLUSIVE_SLOTS.isGestationalCarrierVariable.path,
  );
  const gameteRole = useStageValue(
    PEDIGREE_EXCLUSIVE_SLOTS.gameteRoleVariable.path,
  );

  const draftClaims = useMemo(() => {
    const nodeSubject = subjectOf('node', nodeType);
    const edgeSubject = subjectOf('edge', edgeType);
    return draftExclusiveSlotClaims([
      {
        subject: nodeSubject,
        slot: PEDIGREE_EXCLUSIVE_SLOTS.egoVariable.slot,
        variableId: ego,
      },
      {
        subject: nodeSubject,
        slot: PEDIGREE_EXCLUSIVE_SLOTS.relationshipVariable.slot,
        variableId: relationship,
      },
      {
        subject: edgeSubject,
        slot: PEDIGREE_EXCLUSIVE_SLOTS.relationshipTypeVariable.slot,
        variableId: relationshipType,
      },
      {
        subject: edgeSubject,
        slot: PEDIGREE_EXCLUSIVE_SLOTS.isActiveVariable.slot,
        variableId: isActive,
      },
      {
        subject: edgeSubject,
        slot: PEDIGREE_EXCLUSIVE_SLOTS.isGestationalCarrierVariable.slot,
        variableId: isGestationalCarrier,
      },
      {
        subject: edgeSubject,
        slot: PEDIGREE_EXCLUSIVE_SLOTS.gameteRoleVariable.slot,
        variableId: gameteRole,
      },
    ]);
  }, [
    edgeType,
    ego,
    gameteRole,
    isActive,
    isGestationalCarrier,
    nodeType,
    relationship,
    relationshipType,
  ]);

  return useMemo(
    () => ({
      roleMap: buildVariableRoleMap(protocolContext),
      slotMap: buildExclusiveVariableSlotMap(protocolContext),
      draftSlotMap: draftClaims,
    }),
    [draftClaims, protocolContext],
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
 * A researcher picking a different type is told apart from the draft moving
 * beneath the form — an undo, a redo, a collaborator's change — by
 * `useOnResearcherChange`, which is the one place that distinction is made.
 *
 * The throwing away is `useDiscardStageValues`, which is the one seam a reset
 * goes through: the SESSION is told, in one batch carrying the type that
 * caused it, and the form is emptied afterwards. A form-only clear would leave
 * the draft holding the old type's attributes, and the draft is what a bound
 * list resolves its next row against and what every field seeds itself from —
 * so the next form field the researcher adds would bring them back. The type
 * travels in the same batch because it is an ordinary field, which waits for
 * the submit that flushes it: sent alone, the clears would reach a
 * live-applying host as a stage describing the OLD type with none of its
 * attributes, which is a stage nobody authored.
 */
/**
 * The words one pedigree type change is announced in.
 *
 * DESCRIPTORS, because the sentences belong to the section that owns the
 * control rather than to this module: what a node type change costs — the
 * display label, the family member form, every nomination prompt — is not what
 * an edge type change costs, and a string handed across this seam is extracted
 * by nothing and translated by nobody.
 */
export type EntityTypeChangeWords = Readonly<{
  title: MessageDescriptor;
  description: MessageDescriptor;
  confirmLabel: MessageDescriptor;
}>;

/**
 * The question a pedigree type change has to ask before it may go ahead.
 *
 * `useResetOnEntityTypeChange` below throws away everything that described the
 * previous type, and a chip is one click: an accidental pick discarded the
 * member form and every nomination prompt with no warning at all, leaving undo
 * as the only way back from a change the researcher never intended to make.
 *
 * Asked of the SAME paths the reset discards, so the question can neither
 * appear over a change that costs nothing nor stay silent over one that costs
 * something. `undefined` — nothing bound at any of them — lets the pick
 * through, which is what a first choice on a new pedigree is.
 *
 * `useAskStageHasAnyValue` is the shared "does the stage hold anything here"
 * that a capability's switch-off is judged by, so a type change and a switch
 * warn about exactly the same content.
 */
export function useEntityTypeChangeConfirmation(
  dependentPaths: readonly string[],
  words: EntityTypeChangeWords,
): () => EntityTypeChangeConfirmation | undefined {
  const intl = useAppIntl();
  const hasAnyValue = useAskStageHasAnyValue();
  // The paths themselves rather than the array carrying them, for the reason
  // `useResetOnEntityTypeChange` gives.
  const key = JSON.stringify(dependentPaths);
  const latestPaths = useRef(dependentPaths);
  latestPaths.current = dependentPaths;

  return useCallback(() => {
    if (!hasAnyValue(latestPaths.current)) return undefined;
    return {
      title: intl.formatMessage(words.title),
      description: intl.formatMessage(words.description),
      confirmLabel: intl.formatMessage(words.confirmLabel),
    };
  }, [hasAnyValue, intl, key, words]);
}

export function useResetOnEntityTypeChange(
  typePath: string,
  dependentPaths: readonly string[],
): void {
  const discardStageValues = useDiscardStageValues();
  // The paths themselves, not the array carrying them: a section that spells
  // its list inline hands over a new array on every render.
  const latestPaths = useRef(dependentPaths);
  latestPaths.current = dependentPaths;

  useOnResearcherChange(typePath, (typeValue) => {
    discardStageValues(latestPaths.current, {
      path: typePath,
      value: typeValue,
    });
  });
}
