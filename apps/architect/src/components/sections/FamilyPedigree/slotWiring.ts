import { get } from 'es-toolkit/compat';

import {
  crossClassPickIssue,
  unvalidatedElsewhereMessage,
  validatedElsewhereMessage,
  variableDisplayName,
} from '~/components/Validations/contradictions';
import type { RootState } from '~/ducks/store';
import { type ExclusiveSlotClaim, roleMapKey } from '~/selectors/indexes';
import {
  excludeInterfaceOwned,
  excludeUnvalidatedUses,
  excludeValidatedUses,
  interfaceOwnedPickIssue,
} from '~/selectors/roleFilters';

type Subject = { entity: 'node' | 'edge'; type: string };

type Option = { value: string; label: string; type?: string };

type RoleMap = Record<string, { validated: number; unvalidated: number }>;

/**
 * Which class of writer a Family Pedigree picker itself is.
 *
 * A structural slot writes its variable from the tree the participant draws,
 * with no validation of its own (`unvalidated`); the node label is collected
 * through a validated form field (`validated`). The two classes exclude
 * opposite things, so this one value decides BOTH the picker's exclusion and
 * the save-time gate's direction — pass the same value to
 * `selectSlotPickerOptions` and `makeSlotCrossClassValidator` and they cannot
 * disagree about which picks are legal.
 */
type WriterClass = 'validated' | 'unvalidated';

/** The refusal each class earns when the OTHER class already claims the pick. */
const CONFLICT_MESSAGE: Record<WriterClass, (variableName: string) => string> =
  {
    unvalidated: validatedElsewhereMessage,
    validated: unvalidatedElsewhereMessage,
  };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The options a Family Pedigree picker may offer.
 *
 * Two exclusions, always together:
 *
 * - the cross-class one, in whichever direction `writerClass` demands; and
 * - the interface-owned one, which drops a variable ANOTHER interface slot
 *   claims. `ownSlot` keeps a variable a second Family Pedigree binds in the
 *   SAME slot on offer — sharing structural variables between two pedigrees
 *   over one node type is legitimate authoring, and the protocol rule is
 *   slot-aware for exactly that reason.
 *
 * Both keep `currentValue` offered, so an imported protocol's existing pick
 * never vanishes from its own picker; the save-time gate is what explains
 * such a pick to the researcher.
 */
export const selectSlotPickerOptions = <T extends Option>(
  state: RootState,
  {
    subject,
    options,
    currentValue,
    ownSlot,
    writerClass,
  }: {
    subject: Subject | null;
    options: T[];
    currentValue?: string;
    ownSlot?: string;
    writerClass: WriterClass;
  },
): T[] => {
  if (!subject) return [];
  const crossClassFiltered =
    writerClass === 'validated'
      ? excludeUnvalidatedUses(state, subject, options, currentValue)
      : excludeValidatedUses(state, subject, options, currentValue);
  return excludeInterfaceOwned(
    state,
    subject,
    crossClassFiltered,
    currentValue,
    ownSlot,
  );
};

/**
 * The save-time gate for one Family Pedigree slot picker: a sync field
 * validator, so an invalid pick blocks the stage editor's save — the same
 * field-level `crossClassPick` shape NetworkComposer's quickAdd uses.
 *
 * It refuses a pick that
 *
 * 1. another interface slot owns outright (the picker already drops those, so
 *    this catches a stale draft or an imported protocol); or
 * 2. this stage's own UNSAVED draft already claims in the opposite writer
 *    class — both classes live on one stage form, so the validator sees the
 *    sibling draft directly through `allValues`; or
 * 3. the saved document already claims in the opposite writer class.
 *
 * It escapes the slot's own COMMITTED value throughout, so a pre-existing
 * conflict (an imported protocol, say) stays saveable — the timeline alert
 * handles that non-destructively rather than trapping the researcher in an
 * editor that will not close.
 */
export const makeSlotCrossClassValidator =
  ({
    subject,
    committedConfig,
    committedKey,
    ownSlot,
    exclusiveSlotMap,
    roleMap,
    allVariables,
    writerClass,
    draftConflictingVariables,
  }: {
    subject: Subject | null;
    /** The stage's COMMITTED `nodeConfig`/`edgeConfig`. */
    committedConfig: unknown;
    /** This slot's key within that committed config. */
    committedKey: string;
    /** The interface slot this picker itself fills, if any. */
    ownSlot?: string;
    exclusiveSlotMap: Record<string, ExclusiveSlotClaim>;
    roleMap: RoleMap;
    allVariables: Record<string, unknown>;
    writerClass: WriterClass;
    /**
     * Variables the same unsaved stage form already claims in the OPPOSITE
     * writer class, read from the validator's `allValues`. Omitted where the
     * stage has no such sibling (FamilyPedigree has no validated writer on its
     * edge type).
     */
    draftConflictingVariables?: (allValues: unknown) => readonly string[];
  }) =>
  (value: unknown, allValues?: unknown): string | undefined => {
    if (!subject) return undefined;
    const variableId = typeof value === 'string' ? value : '';
    if (!variableId) return undefined;

    const committedRaw: unknown = isRecord(committedConfig)
      ? committedConfig[committedKey]
      : undefined;
    const committed = typeof committedRaw === 'string' ? committedRaw : '';
    if (variableId === committed) return undefined;

    const ownedIssue = interfaceOwnedPickIssue(
      exclusiveSlotMap,
      subject,
      variableId,
      ownSlot,
    );
    if (ownedIssue) return ownedIssue;

    const message = CONFLICT_MESSAGE[writerClass];
    if (draftConflictingVariables?.(allValues).includes(variableId)) {
      return message(variableDisplayName(allVariables, variableId));
    }

    const conflictingRole =
      writerClass === 'validated' ? 'unvalidated' : 'validated';
    return crossClassPickIssue({
      variableId,
      originalVariableId: committed,
      hasConflictingUse: (id) =>
        (roleMap[roleMapKey(subject, id)]?.[conflictingRole] ?? 0) > 0,
      allVariables,
      message,
    });
  };

/**
 * The variables a Family Pedigree's own unsaved `nodeConfig.form` draft
 * collects — the VALIDATED writers a structural slot must not also claim.
 */
export const draftFormFieldVariables = (
  allValues: unknown,
): readonly string[] => {
  const draftFormFields: unknown = get(allValues, 'nodeConfig.form');
  if (!Array.isArray(draftFormFields)) return [];
  return draftFormFields
    .filter(isRecord)
    .map((field) => field.variable)
    .filter((variable): variable is string => typeof variable === 'string');
};
