import { createSelector, type Selector } from '@reduxjs/toolkit';
import { isNil } from 'es-toolkit';
import { get } from 'es-toolkit/compat';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import type { RootState } from '../store/store';
import { getEntityAttributes } from '../utils/networkEntities';
import {
  getCurrentPrompt,
  getCurrentStage,
  getNetworkEdges,
  getNetworkNodesForType,
} from './session';
import { createDeepEqualSelector } from './utils';

/** The layout the current stage places nodes in, or null if it has none. */
const getStageLayout = createSelector(getCurrentStage, (stage) =>
  stage.type === 'Sociogram' || stage.type === 'NetworkComposer'
    ? stage.layout
    : null,
);

const getPromptDisplayEdges = createDeepEqualSelector(
  getCurrentPrompt,
  (prompt) => (prompt ? get(prompt, 'edges.display', []) : []),
);

/**
 * Selector for placed nodes.
 *
 * requires:
 * { layout, subject } props
 *
 * Must *ALWAYS* return an array, even if empty.
 */
export const getPlacedNodes: Selector<RootState, NcNode[]> =
  createDeepEqualSelector(
    getNetworkNodesForType,
    getStageLayout,
    (nodes, layout) => {
      if (!layout) return [];
      return nodes.filter((node) => !isNil(getEntityAttributes(node)[layout]));
    },
  );

/**
 * Selector for edges.
 *
 * requires:
 * { subject, layout, displayEdges } props
 */
export const getEdges: Selector<RootState, NcEdge[]> = createDeepEqualSelector(
  getNetworkEdges,
  getPromptDisplayEdges,
  (edges, displayEdges) =>
    edges.filter((edge) => displayEdges.includes(edge.type)),
);

/**
 * Selector for all unplaced nodes (for the drawer).
 *
 * Returns all nodes of the stage's node types that have no position in the
 * stage layout.
 */
export const getUnplacedNodes: Selector<RootState, NcNode[]> =
  createDeepEqualSelector(
    getNetworkNodesForType,
    getStageLayout,
    (nodes, layout) => {
      if (!layout) return [];
      return nodes.filter((node) => isNil(getEntityAttributes(node)[layout]));
    },
  );
