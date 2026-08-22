import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import {
  type EntityScopeRef,
  scopeKey,
  uniqueSlotMembers,
} from '../../constraints/generateEntityAttributes';
import type { EntityConstraints } from '../../constraints/types';
import {
  type UniqueRegistry,
  valueKey,
} from '../../constraints/uniqueRegistry';
import type { SessionEngine } from '../../session-engine/engine';

/**
 * The variables each node holds a value for that the `unique` registry did not
 * issue it — today a binning stage's prompt variable, the only attribute
 * written outside a form that a `unique` rule can reach (layout and location
 * variables take no validation at all).
 *
 * Read where a node is regenerated: the release a redraw makes gives back the
 * value the registry issued that node, and a value listed here is not one of
 * them.
 *
 * Keyed by the node itself rather than threaded through the simulation
 * context, so it lives exactly as long as the nodes of the session that wrote
 * it. Every entry is unreachable once its session's network is, and a batch's
 * sessions hold entirely distinct node objects, so two sessions cannot collide
 * here.
 */
const outOfBandWrites = new WeakMap<NcNode, Set<string>>();

/** The `unique` slot a node variable's value is issued from, if any. */
export const uniqueSlotFor = (
  constraints: EntityConstraints,
  variableId: string,
): { slot: string; memberIds: string[] } | undefined => {
  for (const [slot, memberIds] of uniqueSlotMembers(constraints)) {
    if (memberIds.includes(variableId)) return { slot, memberIds };
  }

  return undefined;
};

/**
 * Writes what a binning interaction decided onto a node, through the engine,
 * and squares the `unique` registry with it.
 *
 * `set` is the one variable the placement answers; `unset` is the pair's other
 * half, which the same placement clears (a categorical bin drop clears the
 * prompt's `otherVariable`, and an other-bin drop clears the categorical). One
 * patch, because that is one participant action.
 *
 * The write itself claims nothing. Neither binning interface renders a form
 * field for its prompt variable — OrdinalBin renders no `Field` at all,
 * CategoricalBin one only for a prompt's `otherVariable` — so the interview
 * never validates it, and two alters sharing a bin is an arrangement the
 * interface offers rather than a duplicate to be prevented.
 *
 * What the write does do is take off the node whatever the registry issued it
 * for the variables it touches, and two things follow. A displaced value is
 * given back, because no node holds it any more and leaving it claimed drains
 * a space feasibility sized against the entity count. And the variable is
 * recorded as one the registry did not issue: a later form regenerating it is
 * handed the value the node currently holds, and would otherwise release a
 * claim that is not this node's — where two bin assignments collided,
 * releasing that value for the second node frees the first node's claim and
 * the draw can issue it a second time.
 */
export const assignBinValue = ({
  engine,
  node,
  scope,
  currentStep,
  uniqueRegistry,
  constraints,
  set,
  unset,
}: {
  engine: SessionEngine;
  node: NcNode;
  scope: EntityScopeRef;
  currentStep: number;
  uniqueRegistry: UniqueRegistry;
  /**
   * The entity's FULL constraints, not the bin-relaxed ones: which slot a
   * value belongs to is a property of the codebook, and the relaxation only
   * decides whether a draw enforces it.
   */
  constraints: EntityConstraints;
  set: Readonly<Record<string, VariableValue>>;
  unset: readonly string[];
}): void => {
  const attributes = node[entityAttributesProperty];
  const displaced = new Map<string, VariableValue | undefined>();
  for (const id of [...Object.keys(set), ...unset]) {
    displaced.set(id, attributes[id]);
  }

  engine.updateNode({
    nodeId: node[entityPrimaryKeyProperty],
    attributePatch: { set, unset },
    currentStep,
  });

  const registry = scopeKey(scope);
  const written = outOfBandWrites.get(node) ?? new Set<string>();

  for (const [variableId, previous] of displaced) {
    const uniqueSlot = uniqueSlotFor(constraints, variableId);
    if (uniqueSlot === undefined) continue;

    // A value an earlier bin wrote was never issued to this node, so there is
    // nothing of this node's for this write to displace.
    const wasIssued = previous !== undefined && !written.has(variableId);

    const next = set[variableId];
    // A bin landing on the value the node already carried displaces nothing:
    // the registry's claim still describes what the node holds, and the redraw
    // a later form makes should give it back as it always did.
    if (
      wasIssued &&
      next !== undefined &&
      valueKey(next) === valueKey(previous)
    ) {
      continue;
    }

    // A variable the placement CLEARED holds nothing afterwards, so it is not
    // one of the node's out-of-band values any more.
    if (next === undefined) written.delete(variableId);
    else written.add(variableId);
    outOfBandWrites.set(node, written);

    if (!wasIssued) continue;

    // A `sameAs` sibling still carrying the issued value leaves the node
    // holding it, so the claim stays; dropping this variable from a later
    // regeneration's `existing` is what points the redraw's release at the
    // sibling.
    const previousKey = valueKey(previous);
    const stillHeld = uniqueSlot.memberIds.some((id) => {
      const held = attributes[id];
      return held !== undefined && valueKey(held) === previousKey;
    });
    if (stillHeld) continue;

    uniqueRegistry.release(registry, uniqueSlot.slot, previous);
  }
};

/**
 * The values a regeneration resolves against, with the ones a binning stage
 * wrote out of band dropped from the variables being redrawn.
 *
 * A redraw of a `unique` variable releases the value the entity currently
 * holds before drawing its replacement, and reads that value from `existing`.
 * That is right for a value the registry issued this entity, and wrong for one
 * a binning stage wrote: the registry's claim on such a value, if it holds one
 * at all, belongs to whichever entity was issued it, so handing it back frees a
 * value somebody else still carries. A variable being redrawn contributes
 * nothing else through `existing` — a comparison or `differentFrom` rule
 * resolves against the *other* variables' values — so dropping it costs the
 * draw nothing.
 *
 * The consumer is any simulator that REGENERATES a node's attributes rather
 * than creating them: AlterForm and NetworkComposer's inspector. Neither is
 * built yet, so the pair is held to its contract by
 * `simulators/__tests__/binWrites.test.ts` rather than by a caller.
 */
export const existingForRegeneration = (
  node: NcNode,
  regenerated: ReadonlySet<string>,
): Record<string, VariableValue> => {
  const attributes = node[entityAttributesProperty];
  const written = outOfBandWrites.get(node);
  if (written === undefined) return attributes;

  const dropped = [...written].filter((id) => regenerated.has(id));
  if (dropped.length === 0) return attributes;

  const existing = { ...attributes };
  for (const id of dropped) delete existing[id];
  return existing;
};

/** Marks regenerated variables as the registry's again, now it has issued them. */
export const clearOutOfBandWrites = (
  node: NcNode,
  regenerated: ReadonlySet<string>,
): void => {
  const written = outOfBandWrites.get(node);
  if (written === undefined) return;

  for (const id of regenerated) written.delete(id);
  if (written.size === 0) outOfBandWrites.delete(node);
};
