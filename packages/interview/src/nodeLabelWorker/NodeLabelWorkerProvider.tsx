'use client';

import { type ReactNode, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { getNetwork } from '../selectors/session';
import { getCodebook, getNodeLabelWorker } from '../store/modules/protocol';
import { NodeLabelStore } from './NodeLabelStore';
import { NodeLabelStoreContext } from './nodeLabelStoreContext';

/**
 * Runs the protocol's node label worker, when it has one, for everything
 * below that shows a node's label.
 */
export function NodeLabelWorkerProvider({ children }: { children: ReactNode }) {
  const source = useSelector(getNodeLabelWorker);
  const network = useSelector(getNetwork);
  const codebook = useSelector(getCodebook);

  const store = useMemo(
    () => (source ? new NodeLabelStore(source) : null),
    [source],
  );

  useEffect(() => {
    if (store && network) store.setContext(network, codebook);
  }, [store, network, codebook]);

  useEffect(
    () => () => {
      store?.stop();
    },
    [store],
  );

  return (
    <NodeLabelStoreContext value={store}>{children}</NodeLabelStoreContext>
  );
}
