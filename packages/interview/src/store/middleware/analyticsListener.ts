'use client';

import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';

import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import { codebookTypeIndex } from '../../analytics/codebookTypeIndex';
import type { Tracker } from '../../analytics/tracker';
import {
  addEdge,
  addNode,
  addNodesAndEdges,
  addNodeToPrompt,
  deleteEdge,
  deleteNode,
  removeNodeFromPrompt,
  restoreNetwork,
  restoreNode,
} from '../modules/session';
import { encryptionUnlocked, passphraseRejected } from '../modules/ui';
import type { AppDispatch, RootState } from '../store';

type AnalyticsListenerArgs = {
  tracker: Tracker;
};

export function createAnalyticsListenerMiddleware({
  tracker,
}: AnalyticsListenerArgs) {
  const analyticsListenerMiddleware = createListenerMiddleware();
  const startAppListening =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Redux Toolkit's documented way to type startListening for this store
    analyticsListenerMiddleware.startListening as TypedStartListening<
      RootState,
      AppDispatch
    >;

  // node_added — addNode.fulfilled doesn't carry the generated UUID in its
  // payload (the reducer assigns it), so we diff state to find the new node.
  startAppListening({
    actionCreator: addNode.fulfilled,
    effect: (action, listenerApi) => {
      const stateAfter = listenerApi.getState();
      const stateBefore = listenerApi.getOriginalState();
      const before = stateBefore.session.network?.nodes ?? [];
      const after = stateAfter.session.network?.nodes ?? [];
      if (after.length <= before.length) return;
      const newNode = after[after.length - 1];
      if (!newNode) return;
      tracker.track('node_added', {
        node_id: newNode._uid,
        node_type_index: codebookTypeIndex(
          stateAfter.protocol.codebook,
          'node',
          action.payload?.type,
        ),
      });
    },
  });

  // A family pedigree is committed as one change; it reports each person and
  // relationship as the single adds do.
  startAppListening({
    actionCreator: addNodesAndEdges.fulfilled,
    effect: (action, listenerApi) => {
      const state = listenerApi.getState();
      for (const node of action.payload.nodes) {
        tracker.track('node_added', {
          node_id: node.nodeId,
          node_type_index: codebookTypeIndex(
            state.protocol.codebook,
            'node',
            node.type,
          ),
        });
      }
      for (const edge of action.payload.edges) {
        tracker.track('edge_created', {
          edge_id: edge.edgeId,
          edge_type_index: codebookTypeIndex(
            state.protocol.codebook,
            'edge',
            edge.type,
          ),
        });
      }
    },
  });

  // Undo and redo put a removed node back as it was. It is reported as added
  // again, as its removal was reported.
  startAppListening({
    actionCreator: restoreNode,
    effect: (action, listenerApi) => {
      tracker.track('node_added', {
        node_id: action.payload[entityPrimaryKeyProperty],
        node_type_index: codebookTypeIndex(
          listenerApi.getState().protocol.codebook,
          'node',
          action.payload.type,
        ),
      });
    },
  });

  // Undo and redo put a captured family back as it was: each person and
  // relationship it brings back is reported as added again, and each it takes
  // away as removed, as the change it reverses or repeats was reported.
  startAppListening({
    actionCreator: restoreNetwork,
    effect: (_action, listenerApi) => {
      const before = listenerApi.getOriginalState().session.network;
      const after = listenerApi.getState().session.network;
      const { codebook } = listenerApi.getState().protocol;
      const idsOf = (entities: readonly { _uid: string }[]) =>
        new Set(entities.map((entity) => entity[entityPrimaryKeyProperty]));
      const nodesBefore = idsOf(before?.nodes ?? []);
      const nodesAfter = idsOf(after?.nodes ?? []);
      const edgesBefore = idsOf(before?.edges ?? []);
      const edgesAfter = idsOf(after?.edges ?? []);
      for (const node of after?.nodes ?? []) {
        if (nodesBefore.has(node[entityPrimaryKeyProperty])) continue;
        tracker.track('node_added', {
          node_id: node[entityPrimaryKeyProperty],
          node_type_index: codebookTypeIndex(codebook, 'node', node.type),
        });
      }
      for (const id of nodesBefore) {
        if (!nodesAfter.has(id)) tracker.track('node_removed', { node_id: id });
      }
      for (const edge of after?.edges ?? []) {
        if (edgesBefore.has(edge[entityPrimaryKeyProperty])) continue;
        tracker.track('edge_created', {
          edge_id: edge[entityPrimaryKeyProperty],
          edge_type_index: codebookTypeIndex(codebook, 'edge', edge.type),
        });
      }
      for (const id of edgesBefore) {
        if (!edgesAfter.has(id)) tracker.track('edge_removed', { edge_id: id });
      }
    },
  });

  startAppListening({
    actionCreator: deleteNode,
    effect: (action) => {
      tracker.track('node_removed', { node_id: action.payload });
    },
  });

  startAppListening({
    actionCreator: addEdge.fulfilled,
    effect: (action, listenerApi) => {
      const payload = action.payload as
        | { edgeId?: string; type?: string }
        | undefined;
      if (!payload?.edgeId) return;
      tracker.track('edge_created', {
        edge_id: payload.edgeId,
        edge_type_index: codebookTypeIndex(
          listenerApi.getState().protocol.codebook,
          'edge',
          payload.type,
        ),
      });
    },
  });

  startAppListening({
    actionCreator: deleteEdge,
    effect: (action) => {
      tracker.track('edge_removed', { edge_id: action.payload });
    },
  });

  startAppListening({
    actionCreator: addNodeToPrompt.fulfilled,
    effect: (action) => {
      tracker.track('node_added_to_prompt', {
        node_id: action.payload?.nodeId,
      });
    },
  });

  startAppListening({
    actionCreator: removeNodeFromPrompt.fulfilled,
    effect: (action) => {
      tracker.track('node_removed_from_prompt', {
        node_id: action.payload?.nodeId,
      });
    },
  });

  // Anonymisation. Neither the passphrase nor anything derived from it is
  // sent.
  startAppListening({
    actionCreator: encryptionUnlocked,
    effect: () => {
      tracker.track('passphrase_set');
    },
  });

  startAppListening({
    actionCreator: passphraseRejected,
    effect: () => {
      tracker.track('passphrase_validation_failed');
    },
  });

  return analyticsListenerMiddleware;
}
