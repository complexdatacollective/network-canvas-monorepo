'use client';

import { createContext, useContext } from 'react';

import type { NodeLabelStore } from './NodeLabelStore';

/** Nothing, when the protocol has no node label worker. */
export const NodeLabelStoreContext = createContext<NodeLabelStore | null>(null);

export const useNodeLabelStore = () => useContext(NodeLabelStoreContext);
