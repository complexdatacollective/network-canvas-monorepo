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

/**
 * Tracks the session writes still under way. Protecting an answer makes a
 * write take a while, and a stage can start one without waiting for it, so
 * leaving the stage, finishing or closing the interview waits for them: the
 * next stage's skip logic and the session handed back to the host then
 * include them.
 */
export function createWritesInFlightMiddleware(): {
  middleware: Middleware;
  // Resolves once every write begun so far has been stored or refused, or is
  // undefined when none is under way.
  writesSettled: () => Promise<void> | undefined;
} {
  const inFlight = new Set<string>();
  let waiting: { writes: Set<string>; resolve: () => void }[] = [];

  const middleware: Middleware = () => (next) => (action) => {
    if (!isSessionWrite(action)) return next(action);
    const { requestId, requestStatus } = action.meta;
    if (requestStatus === 'pending') inFlight.add(requestId);
    const result = next(action);
    if (requestStatus !== 'pending') {
      inFlight.delete(requestId);
      waiting = waiting.filter(({ writes, resolve }) => {
        writes.delete(requestId);
        if (writes.size > 0) return true;
        resolve();
        return false;
      });
    }
    return result;
  };

  const writesSettled = () => {
    if (inFlight.size === 0) return undefined;
    const writes = new Set(inFlight);
    return new Promise<void>((resolve) => {
      waiting.push({ writes, resolve });
    });
  };

  return { middleware, writesSettled };
}
