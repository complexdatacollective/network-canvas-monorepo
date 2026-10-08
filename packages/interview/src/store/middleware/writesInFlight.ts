'use client';

import { isAsyncThunkAction, type Middleware } from '@reduxjs/toolkit';

import {
  addEdge,
  addNode,
  addNodesAndEdges,
  addNodeToPrompt,
  removeNodeFromPrompt,
  toggleEdge,
  toggleNodeAttributes,
  updateEdge,
  updateEgo,
  updateNode,
} from '../modules/session';

const isSessionWrite = isAsyncThunkAction(
  addEdge,
  addNode,
  addNodesAndEdges,
  addNodeToPrompt,
  removeNodeFromPrompt,
  toggleEdge,
  toggleNodeAttributes,
  updateEdge,
  updateEgo,
  updateNode,
);

type Waiting = {
  writes: Set<string>;
  refused: boolean;
  resolve: (allStored: boolean) => void;
};

/**
 * Tracks the session writes still under way. Protecting an answer makes a
 * write take a while, and a stage can start one without waiting for it, so
 * leaving the stage, finishing or closing the interview waits for them: the
 * next stage's skip logic and the session handed back to the host then
 * include them.
 */
export function createWritesInFlightMiddleware(): {
  middleware: Middleware;
  // Resolves once every write begun so far has been stored or refused, with
  // whether all of them were stored, or is undefined when none is under way.
  writesSettled: () => Promise<boolean> | undefined;
} {
  const inFlight = new Set<string>();
  let waiting: Waiting[] = [];

  const settle = (requestId: string, stored: boolean) => {
    inFlight.delete(requestId);
    waiting = waiting.filter((wait) => {
      if (!wait.writes.delete(requestId)) return true;
      if (!stored) wait.refused = true;
      if (wait.writes.size > 0) return true;
      wait.resolve(!wait.refused);
      return false;
    });
  };

  const middleware: Middleware = () => (next) => (action) => {
    if (!isSessionWrite(action)) return next(action);
    const { requestId, requestStatus } = action.meta;
    if (requestStatus === 'pending') {
      inFlight.add(requestId);
      return next(action);
    }

    // A reducer that throws on a write's outcome has not stored it, and must
    // not leave it under way for good, or everything waiting would hang.
    let stored = false;
    try {
      const result = next(action);
      stored = requestStatus === 'fulfilled';
      return result;
    } finally {
      settle(requestId, stored);
    }
  };

  const writesSettled = () => {
    if (inFlight.size === 0) return undefined;
    const writes = new Set(inFlight);
    return new Promise<boolean>((resolve) => {
      waiting.push({ writes, refused: false, resolve });
    });
  };

  return { middleware, writesSettled };
}
