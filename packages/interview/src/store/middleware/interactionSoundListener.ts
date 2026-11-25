'use client';

import {
  createListenerMiddleware,
  isAsyncThunkAction,
  isFulfilled,
  isPending,
  isRejected,
  type TypedStartListening,
  type UnknownAction,
} from '@reduxjs/toolkit';

import { entityPrimaryKeyProperty } from '@codaco/shared-consts';

import type { OneShotSoundName, SoundEngine } from '../../sounds/soundEngine';
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

type InteractionSoundListenerArgs = Pick<SoundEngine, 'play'> &
  Partial<Pick<SoundEngine, 'isHandlingDrop'>>;

const idsOf = (entities: readonly { _uid: string }[]) =>
  new Set(entities.map((entity) => entity[entityPrimaryKeyProperty]));

/**
 * Plays the sound for each change to the network whose meaning does not
 * depend on where it was made: a person added or removed, added to or taken
 * off a question, a connection made or removed, a person marked or unmarked.
 *
 * A toggled connection (`toggleEdge`) is heard through the `addEdge` or
 * `deleteEdge` it dispatches. Changes to a person's answers (`updateNode`)
 * make no sound here: where one does mean something audible (a person
 * dropped in a bin or on the sociogram, or placed in a bin by choosing it),
 * the drop target or the component that made it plays the sound, and an
 * option chosen in a field is heard from the field. An answer that
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
 *
 * A change made by dropping a dragged person (into the bin, onto a list, back
 * to a panel) is heard as the drop: the drop target's own sound plays, and
 * nothing here does. A change is the drop's when it is dispatched while the
 * engine carries the drop out (`isHandlingDrop`), or when it is the result of
 * an asynchronous action started then. The same change made any other way (a
 * button, a form, undo) keeps its sound.
 */
export function createInteractionSoundListenerMiddleware({
  play,
  isHandlingDrop = () => false,
}: InteractionSoundListenerArgs) {
  const listenerMiddleware = createListenerMiddleware();
  const startAppListening =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Redux Toolkit's documented way to type startListening for this store
    listenerMiddleware.startListening as TypedStartListening<
      RootState,
      AppDispatch
    >;

  // The asynchronous actions a drop started, by request id, until each has
  // finished.
  const startedByDrop = new Set<string>();
  startAppListening({
    predicate: (action) => isPending(action) && isHandlingDrop(),
    effect: (action) => {
      if (isAsyncThunkAction(action)) startedByDrop.add(action.meta.requestId);
    },
  });

  const madeByDrop = (action: UnknownAction) =>
    isHandlingDrop() ||
    (isAsyncThunkAction(action) && startedByDrop.has(action.meta.requestId));

  // Each sound below is played only for a change no drop made.
  const playFor = (action: UnknownAction, name: OneShotSoundName) => {
    if (!madeByDrop(action)) play(name);
  };

  startAppListening({
    actionCreator: addNode.fulfilled,
    effect: (action) => playFor(action, 'create-node'),
  });

  startAppListening({
    actionCreator: restoreNode,
    effect: (action) => playFor(action, 'create-node'),
  });

  startAppListening({
    actionCreator: addNodesAndEdges.fulfilled,
    effect: (action) => {
      if (action.payload.nodes.length > 0) playFor(action, 'create-node');
      else if (action.payload.edges.length > 0) playFor(action, 'create-edge');
    },
  });

  startAppListening({
    actionCreator: restoreNetwork,
    effect: (action, listenerApi) => {
      const before = listenerApi.getOriginalState().session.network;
      const after = listenerApi.getState().session.network;
      const nodesBefore = idsOf(before?.nodes ?? []);
      const nodesAfter = idsOf(after?.nodes ?? []);
      const edgesBefore = idsOf(before?.edges ?? []);
      const edgesAfter = idsOf(after?.edges ?? []);
      if (someMissing(nodesBefore, nodesAfter)) playFor(action, 'discard');
      if (someMissing(nodesAfter, nodesBefore)) playFor(action, 'create-node');
      if (someMissing(edgesAfter, edgesBefore)) playFor(action, 'create-edge');
      if (someMissing(edgesBefore, edgesAfter)) playFor(action, 'toggle-off');
    },
  });

  startAppListening({
    actionCreator: deleteNode,
    effect: (action) => playFor(action, 'discard'),
  });

  startAppListening({
    actionCreator: addNodeToPrompt.fulfilled,
    effect: (action) => playFor(action, 'toggle-on'),
  });

  startAppListening({
    actionCreator: removeNodeFromPrompt.fulfilled,
    effect: (action) => playFor(action, 'toggle-off'),
  });

  startAppListening({
    actionCreator: addEdge.fulfilled,
    effect: (action) => playFor(action, 'create-edge'),
  });

  startAppListening({
    actionCreator: deleteEdge,
    effect: (action) => playFor(action, 'toggle-off'),
  });

  // A person marked (or unmarked) by tapping them.
  startAppListening({
    actionCreator: toggleNodeAttributes.fulfilled,
    effect: (action) => {
      const markedOn = Object.values(
        action.payload.attributePatch.set,
      ).includes(true);
      playFor(action, markedOn ? 'toggle-on' : 'toggle-off');
    },
  });

  // Registered last, so the sounds above see a drop's action before it is
  // forgotten.
  startAppListening({
    predicate: (action) => isFulfilled(action) || isRejected(action),
    effect: (action) => {
      if (isAsyncThunkAction(action))
        startedByDrop.delete(action.meta.requestId);
    },
  });

  return listenerMiddleware;
}
