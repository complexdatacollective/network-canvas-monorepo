import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';

import { clearScrollPositions } from '~/utils/scrollPositions';

import { setActiveProtocol } from '../modules/activeProtocol';
import type { RootState } from '../modules/root';
import type { AppDispatch } from '../store';

export const scrollPositionsListenerMiddleware = createListenerMiddleware();

type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening =
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Redux Toolkit's documented typed-listener pattern: createListenerMiddleware cannot name RootState and AppDispatch itself, as the store's types are built from this middleware
  scrollPositionsListenerMiddleware.startListening as AppStartListening;

startAppListening({
  actionCreator: setActiveProtocol,
  effect: () => {
    clearScrollPositions();
  },
});
