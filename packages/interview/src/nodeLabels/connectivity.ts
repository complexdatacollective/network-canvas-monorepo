import { createSelector } from '@reduxjs/toolkit';

import { buildConnectivityIndex } from '@codaco/network-query';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

const NO_NODES: readonly NcNode[] = [];
const NO_STORED_EDGES: readonly NcEdge[] = [];

/** The slice of the interview's state a connectivity index is read from. */
type NetworkState = Readonly<{
  session: Readonly<{
    network?:
      | Readonly<{ nodes?: readonly NcNode[]; edges?: readonly NcEdge[] }>
      | undefined;
  }>;
}>;

/**
 * How the interview's nodes are connected, for the text and labels that
 * depend on it. It reads the whole network rather than the nodes a stage's
 * filter leaves, so a node reads alike on every stage. Rebuilt only when the
 * nodes or the edges change, and read only by what asks about edges.
 */
export const getConnectivityIndex = createSelector(
  [
    (state: NetworkState) => state.session.network?.nodes ?? NO_NODES,
    (state: NetworkState) => state.session.network?.edges ?? NO_STORED_EDGES,
  ],
  buildConnectivityIndex,
);
