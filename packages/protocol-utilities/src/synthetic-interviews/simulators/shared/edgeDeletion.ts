import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
} from '@codaco/shared-consts';

import {
  scopeKey,
  uniqueSlotMembers,
} from '../../constraints/generateEntityAttributes';

/** The scope one edge type's constraints and unique values belong to. */
type EdgeScope = { entity: 'edge'; type: string };
import type { EntityConstraints } from '../../constraints/types';
import {
  type UniqueRegistry,
  valueKey,
} from '../../constraints/uniqueRegistry';
import type { SessionEngine } from '../../session-engine/engine';

/**
 * Deletes an edge and squares the `unique` registry with the network the
 * deletion leaves behind.
 *
 * A census answers a pair by removing the edge that stood between them, and
 * the value that edge carried leaves the session with it. Left claimed, the
 * registry describes a network that no longer exists: a later stage asked to
 * grade the same pair again is refused a value nobody holds, and a run
 * feasibility sized against the pairs it would need — one holder for one pair
 * — throws mid-walk on a protocol a participant can complete by answering yes,
 * no, yes.
 *
 * The release is made only where NO remaining edge of the scope still carries
 * the value, so it never frees something another entity holds. That matters
 * because a slot's claim is one bit rather than a count: a value two edges came
 * to share out of band (an override's `attributeData`, say) is claimed once,
 * and handing it back while the second edge still carries it would let a later
 * draw issue it a third time. Asking the network rather than tracking
 * provenance keeps the rule exactly "the registry says what the network holds".
 *
 * One release per slot, not per variable: a `sameAs` group is issued a single
 * value that every member carries, and the registry knows it by the slot.
 */
export const deleteEdgeReleasingValues = ({
  engine,
  edge,
  scope,
  constraints,
  uniqueRegistry,
}: {
  engine: SessionEngine;
  edge: NcEdge;
  scope: EdgeScope;
  constraints: EntityConstraints;
  uniqueRegistry: UniqueRegistry;
}): void => {
  const attributes = edge[entityAttributesProperty];
  engine.deleteEdge({ edgeId: edge[entityPrimaryKeyProperty] });

  const registry = scopeKey(scope);
  const remaining = engine.draft.network.edges.filter(
    (other) => other.type === scope.type,
  );

  for (const [slot, memberIds] of uniqueSlotMembers(constraints)) {
    const held = memberIds
      .map((id) => attributes[id])
      .find((value) => value !== undefined && value !== null);
    if (held === undefined || held === null) continue;

    const key = valueKey(held);
    const stillHeld = remaining.some((other) =>
      memberIds.some((id) => {
        const value = other[entityAttributesProperty][id];
        return value !== undefined && value !== null && valueKey(value) === key;
      }),
    );
    if (stillHeld) continue;

    uniqueRegistry.release(registry, slot, held);
  }
};
