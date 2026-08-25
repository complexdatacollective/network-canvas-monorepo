import type {
  InterfaceImpliedRules,
  Stage,
  Variables,
} from '@codaco/protocol-validation';
import type { NcNode, VariableValue } from '@codaco/shared-consts';

import { collectBinOnlyVariables } from '../../constraints/binOnlyVariables';
import {
  buildEntityConstraints,
  rulesForSubject,
} from '../../constraints/buildConstraints';
import type { GenerationContext } from '../../constraints/context';
import {
  type EntityScopeRef,
  generateEntityAttributes,
  scopeKey,
} from '../../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../../constraints/types';
import { existingForRegeneration, uniqueSlotFor } from './binWrites';

/**
 * The constraints a binning stage draws its prompt values against.
 *
 * Variables a protocol assigns ONLY through a bin prompt have their validation
 * stripped, because the interview never enforces it: neither binning interface
 * builds a form field, so both write the bin's value straight through
 * `updateNode`. Keeping the rules would refuse arrangements the interface can
 * produce — `differentFrom` would forbid two alters sharing a bin.
 *
 * A variable some other stage also writes keeps its rules, because that other
 * site may be a form field where a participant is shown the error.
 *
 * Built here rather than taken from the session's constraint cache for that
 * reason: this is a different analysis of the same codebook, not a second copy
 * of the same one.
 */
export const binConstraints = ({
  variables,
  stages,
  subjectType,
  today,
  interfaceRules,
}: {
  variables: Variables | undefined;
  stages: Stage[];
  subjectType: string;
  today: string;
  interfaceRules: InterfaceImpliedRules;
}): EntityConstraints =>
  buildEntityConstraints(
    variables,
    today,
    collectBinOnlyVariables(stages).get(subjectType) ?? new Set(),
    // Stripping a bin-only variable's DECLARED rules does not strip what the
    // bin itself imposes: an alter dropped into a bin is in exactly one of
    // them, whatever the codebook does or does not say.
    rulesForSubject(interfaceRules, { entity: 'node', type: subjectType }),
  );

/** What one bin prompt drew for one alter, and what the registry did about it. */
export type BinDraw = {
  /** The drawn value, or `undefined` for the alter left where it stands. */
  value: VariableValue | undefined;
  /**
   * Whether the registry ISSUED the value — released the alter's previous
   * value and claimed this one during the draw — so the write that follows
   * must not repeat that bookkeeping. False wherever the variable's relaxed
   * rules carry no `unique` (a bin-only variable), where nothing was drawn,
   * or where no draw was enforced at all.
   */
  issued: boolean;
};

/**
 * The value one alter takes for one bin prompt, drawn through the constraint
 * engine like every other attribute.
 *
 * `undefined` is the alter left in the bucket: the engine emits nothing for a
 * variable its descriptor left unanswered, and an unplaced alter is exactly an
 * alter with no value for that variable.
 *
 * The alter's CURRENT attributes are handed to the draw as `existing` — minus
 * whatever an earlier bin wrote out of band, exactly as
 * {@link existingForRegeneration} keeps for every regenerating simulator — for
 * two reasons the live interface enforces itself. A rule relating this
 * variable to another resolves against the answers the participant actually
 * gave; and a `unique` value the registry issued this alter is RELEASED before
 * its replacement is drawn, so re-binning a full population does not exhaust a
 * value space sized to the entity count (a participant can leave every alter
 * in its current bin, and the redraw can land back on the released value).
 *
 * Where the descriptor then leaves the alter unplaced, the released value is
 * claimed back: the alter still holds it, and a claim describing nothing would
 * drain the space for everyone after it.
 */
export const binValueFor = ({
  constraints,
  generation,
  scope,
  variableId,
  index,
  node,
}: {
  /** The bin-relaxed constraints the draw enforces ({@link binConstraints}). */
  constraints: EntityConstraints;
  generation: GenerationContext;
  scope: EntityScopeRef;
  variableId: string;
  index: number;
  /** The alter being placed; its current attributes feed the draw. */
  node: NcNode;
}): BinDraw => {
  const regenerated = new Set([variableId]);
  const existing = existingForRegeneration(node, regenerated);
  const relaxedSlot = uniqueSlotFor(constraints, variableId);

  // Mirrors the release the draw is about to make (`drawGroup` releases the
  // first defined member value of the slot's group), so an unplaced alter can
  // have exactly that claim restored.
  const releasable = relaxedSlot?.memberIds
    .map((id) => existing[id])
    .find((held) => held !== undefined && held !== null);

  const value = generateEntityAttributes(
    constraints,
    generation,
    scope,
    index,
    {
      only: regenerated,
      existing,
    },
  )[variableId];

  if (value === undefined) {
    // The alter stays where it is, still holding the value the redraw
    // released; give the claim back so the space stays sized to what the
    // network actually holds.
    if (relaxedSlot !== undefined && releasable !== undefined) {
      generation.uniqueRegistry.claim(
        scopeKey(scope),
        relaxedSlot.slot,
        releasable,
      );
    }
    return { value: undefined, issued: false };
  }

  return { value, issued: relaxedSlot !== undefined };
};
