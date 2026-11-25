'use client';

import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';

import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import type { OneShotSoundName } from '../../sounds/soundEngine';
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
  toggleNodeAttributes,
} from '../modules/session';
import type { AppDispatch, RootState } from '../store';

/** Whether any of `ids` is not in `others`. */
const someMissing = (ids: ReadonlySet<string>, others: ReadonlySet<string>) =>
  [...ids].some((id) => !others.has(id));

type InteractionSoundListenerArgs = {
  play: (name: OneShotSoundName) => void;
};

const idsOf = (entities: readonly { _uid: string }[]) =>
  new Set(entities.map((entity) => entity[entityPrimaryKeyProperty]));

/**
 * Plays the sound for each change to the network whose meaning does not
 * depend on where it was made: a person added or removed, added to or taken
 * off a question, a connection made or removed, a person marked or unmarked.
 *
 * A toggled connection (`toggleEdge`) is heard through the `addEdge` or
 * `deleteEdge` it dispatches. Changes to a person's answers (`updateNode`)
 * make no sound here: where one does mean something audible (a person placed
 * in a bin or on the sociogram), the component that made it plays the sound,
 * and an option chosen in a field is heard from the field. An answer that
 * also changes the network (a census answer that makes a connection) asks
 * for both sounds in the same task, and the engine plays the more important.
 *
 * Undo and redo put the network back as it was through `deleteNode`,
 * `restoreNode` and `restoreNetwork`, and are heard as the change they make:
 * a person who comes back sounds added, one who goes away sounds removed.
 * The participant pressed a button that changed the network, and the sound
 * says what changed.
 *
 * The engine gathers the sounds one action asks for and plays only the most
 * important, so removing a person with their connections is heard once.
 */
export function createInteractionSoundListenerMiddleware({
  play,
}: InteractionSoundListenerArgs) {
  const listenerMiddleware = createListenerMiddleware();
  const startAppListening =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Redux Toolkit's documented way to type startListening for this store
    listenerMiddleware.startListening as TypedStartListening<
      RootState,
      AppDispatch
    >;

  startAppListening({
    actionCreator: addNode.fulfilled,
    effect: () => play('create-node'),
  });

  startAppListening({
    actionCreator: restoreNode,
    effect: () => play('create-node'),
  });

  startAppListening({
    actionCreator: addNodesAndEdges.fulfilled,
    effect: (action) => {
      if (action.payload.nodes.length > 0) play('create-node');
      else if (action.payload.edges.length > 0) play('create-edge');
    },
  });

  startAppListening({
    actionCreator: restoreNetwork,
    effect: (_action, listenerApi) => {
      const before = listenerApi.getOriginalState().session.network;
      const after = listenerApi.getState().session.network;
      const nodesBefore = idsOf(before?.nodes ?? []);
      const nodesAfter = idsOf(after?.nodes ?? []);
      const edgesBefore = idsOf(before?.edges ?? []);
      const edgesAfter = idsOf(after?.edges ?? []);
      if (someMissing(nodesBefore, nodesAfter)) play('discard');
      if (someMissing(nodesAfter, nodesBefore)) play('create-node');
      if (someMissing(edgesAfter, edgesBefore)) play('create-edge');
      if (someMissing(edgesBefore, edgesAfter)) play('toggle-off');
    },
  });

  startAppListening({
    actionCreator: deleteNode,
    effect: () => play('discard'),
  });

  startAppListening({
    actionCreator: addNodeToPrompt.fulfilled,
    effect: () => play('toggle-on'),
  });

  startAppListening({
    actionCreator: removeNodeFromPrompt.fulfilled,
    effect: () => play('toggle-off'),
  });

  startAppListening({
    actionCreator: addEdge.fulfilled,
    effect: () => play('create-edge'),
  });

  startAppListening({
    actionCreator: deleteEdge,
    effect: () => play('toggle-off'),
  });

  // A person marked (or unmarked) by tapping them.
  startAppListening({
    actionCreator: toggleNodeAttributes.fulfilled,
    effect: (action) => {
      const markedOn = Object.values(
        action.payload.attributePatch.set,
      ).includes(true);
      play(markedOn ? 'toggle-on' : 'toggle-off');
    },
  });

  return listenerMiddleware;
}
