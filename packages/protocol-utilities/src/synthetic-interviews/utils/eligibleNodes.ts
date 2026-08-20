import { filter as buildFilter } from '@codaco/network-query';
import type { Filter } from '@codaco/protocol-validation';
import {
  entityPrimaryKeyProperty,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

/**
 * The alters a stage puts in front of the participant: those of its subject
 * type that survive its own filter.
 *
 * The filter runs against the WHOLE network rather than the candidate list,
 * unlike a panel's — a stage filter may carry edge rules ("people you said you
 * argue with"), which need the edges to resolve. Narrowing to the subject type
 * happens after, so an edge rule can still consider alters of another type on
 * its way to deciding about these.
 *
 * Returns the nodes the session engine itself holds, not copies, so a
 * simulator can address them by their primary key and read what they currently
 * carry. Reads only: every write goes back through the engine's primitives
 * (spec rule 3).
 */
export const nodesForStage = (
  network: NcNetwork,
  subjectType: string,
  stageFilter?: Filter,
): NcNode[] => {
  if (!stageFilter) {
    return network.nodes.filter((node) => node.type === subjectType);
  }

  // The filter returns its own arrays; matching back by id keeps the caller
  // holding the network's own nodes rather than whatever the filter produced.
  const passed = new Set(
    buildFilter(stageFilter)(network).nodes.map(
      (node) => node[entityPrimaryKeyProperty],
    ),
  );

  return network.nodes.filter(
    (node) =>
      node.type === subjectType && passed.has(node[entityPrimaryKeyProperty]),
  );
};
