import { v4 as uuid } from 'uuid';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

/**
 * The empty network a host assigns to a freshly created interview.
 *
 * Lives in `contract/` (not the store) so it can be re-exported from the
 * React-free `@codaco/interview/contract` entry point and imported by server
 * (RSC) code without evaluating the package's React component graph.
 */
export const createInitialNetwork = (): NcNetwork => ({
  ego: {
    [entityPrimaryKeyProperty]: uuid(),
    [entityAttributesProperty]: {},
  },
  nodes: [],
  edges: [],
});
