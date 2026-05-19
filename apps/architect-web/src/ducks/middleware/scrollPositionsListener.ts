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
  scrollPositionsListenerMiddleware.startListening as AppStartListening;

startAppListening({
  actionCreator: setActiveProtocol,
  effect: () => {
    clearScrollPositions();
  },
});
