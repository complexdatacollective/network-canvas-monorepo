import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';

import type { RootState } from '~/ducks/modules/root';

/**
 * What the in-process host needs of Architect's store, stated structurally so
 * a test store built from the root reducer serves it as the app's store does.
 */
export type ArchitectStore = Readonly<{
  getState: () => RootState;
  dispatch: ThunkDispatch<RootState, undefined, UnknownAction>;
  subscribe: (listener: () => void) => () => void;
}>;
