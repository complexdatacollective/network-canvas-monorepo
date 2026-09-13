import { useCallback, useContext } from 'react';
import { ReactReduxContext } from 'react-redux';

import { getProtocolLockState } from '~/ducks/modules/app';
import type { RootState } from '~/ducks/store';
import { refusedCommitError } from '~/utils/protocolLockMessages';

/**
 * Asks, at the moment a nested editor is submitted, whether this tab may accept
 * the commit — returning the message to show instead when it may not.
 *
 * A tab that does not own the saved copy must not take a Finish and look like
 * it worked: the commit writes the canonical protocol — a write this tab
 * cannot persist, and one that the reclaim's re-read of the saved row would
 * replace without a word.
 *
 * Read as a getter rather than a value, because the lock can change while an
 * editor sits open.
 *
 * The store is read through the react-redux context OPTIONALLY: `DialogForm` is
 * a generic editor shell that tests and stories render on its own, with no
 * store behind it and therefore no protocol and no lock to consult. Inside the
 * app it is always under the Provider.
 */
export const useRefusedNestedCommit = (): (() => string | null) => {
  const reduxContext = useContext(ReactReduxContext);

  return useCallback(() => {
    const state = (reduxContext?.store.getState() ?? null) as RootState | null;
    if (!state) return null;
    return refusedCommitError(getProtocolLockState(state), 'nested-editor');
  }, [reduxContext]);
};
