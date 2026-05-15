import { egoProperty, entityPrimaryKeyProperty } from '@codaco/shared-consts';

import type { FormattedSession, SessionWithNetworkEgo } from '../input';

export const insertEgoIntoSessionNetwork = (
  session: FormattedSession,
): SessionWithNetworkEgo => ({
  ...session,
  nodes: session.nodes
    ? session.nodes.map((node) => ({
        [egoProperty]: session.ego[entityPrimaryKeyProperty],
        ...node,
      }))
    : [],
  edges: session.edges
    ? session.edges.map((edge) => ({
        [egoProperty]: session.ego[entityPrimaryKeyProperty],
        ...edge,
      }))
    : [],
});
