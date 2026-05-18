import { createSelector, type Selector } from '@reduxjs/toolkit';
import { isNil } from 'es-toolkit';
import { get, has } from 'es-toolkit/compat';

import type { NcEdge, NcNode } from '@codaco/shared-consts';

import type { RootState } from '../store/store';
import { getEntityAttributes } from '../utils/networkEntities';
import {
  getCurrentPrompt,
  getNetworkEdges,
  getNetworkNodes,
  getStageSubject,
} from './session';
import { createDeepEqualSelector } from './utils';

const getPromptLayoutVariable = createSelector(getCurrentPrompt, (prompt) =>
  get(prompt, 'layout.layoutVariable', null),
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
    getNetworkNodes,
    getStageSubject,
    getPromptLayoutVariable,
    (nodes, subject, layoutVariable) => {
      if (
        nodes.length === 0 ||
        !subject ||
        subject.entity === 'ego' ||
        !layoutVariable
      ) {
        return [];
      }

      return nodes.filter((node) => {
        const attributes = getEntityAttributes(node);
        return (
          subject.type === node.type &&
          has(attributes, layoutVariable) &&
          !isNil(attributes[layoutVariable])
        );
      });
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
 * Returns all nodes of the stage subject type that have a nil layout variable.
 */
export const getUnplacedNodes: Selector<RootState, NcNode[]> =
  createDeepEqualSelector(
    getNetworkNodes,
    getStageSubject,
    getPromptLayoutVariable,
    (nodes, subject, layoutVariable) => {
      if (
        nodes.length === 0 ||
        !subject ||
        subject.entity === 'ego' ||
        !layoutVariable
      ) {
        return [];
      }

      return nodes.filter((node) => {
        const attributes = getEntityAttributes(node);
        return (
          subject.type === node.type &&
          has(attributes, layoutVariable) &&
          isNil(attributes[layoutVariable])
        );
      });
    },
  );
