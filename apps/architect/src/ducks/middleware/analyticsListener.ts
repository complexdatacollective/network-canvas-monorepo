import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';

import { posthog } from '~/analytics';

import { setActiveProtocol } from '../modules/activeProtocol';
import { createStage } from '../modules/protocol/stages';
import { validateProtocolAsync } from '../modules/protocolValidation';
import type { RootState } from '../modules/root';
import { exportNetcanvas } from '../modules/userActions/userActions';
import type { AppDispatch } from '../store';

export const analyticsListenerMiddleware = createListenerMiddleware();

type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening =
  analyticsListenerMiddleware.startListening as AppStartListening;

startAppListening({
  actionCreator: setActiveProtocol,
  effect: (action) => {
    const protocol = action.payload;
    posthog.capture('protocol_opened', {
      schema_version: protocol?.schemaVersion ?? 8,
      stage_count: protocol?.stages?.length ?? 0,
    });
  },
});

startAppListening({
  actionCreator: createStage,
  effect: (action) => {
    posthog.capture('stage_added', {
      stage_type: action.payload.stage.type ?? 'unknown',
      stage_index: action.payload.index,
    });
  },
});

startAppListening({
  actionCreator: validateProtocolAsync.fulfilled,
  effect: (action) => {
    const { result } = action.payload;
    if (!result.success) {
      // Report only the structural shape of each failure — the issue code and
      // its schema path — never the prettified message or flattened error maps,
      // which embed protocol-derived names and values (codebook record keys,
      // variable names, entered values).
      posthog.capture('protocol_validation_failed', {
        error_count: result.error.issues.length,
        error_codes: result.error.issues.map((issue) => issue.code),
        error_paths: result.error.issues.map((issue) => issue.path.join('.')),
      });
    }
  },
});

startAppListening({
  actionCreator: exportNetcanvas.fulfilled,
  effect: (_action, listenerApi) => {
    const state = listenerApi.getState();
    const protocol = state.activeProtocol?.present;
    posthog.capture('protocol_downloaded', {
      stage_count: protocol?.stages?.length ?? 0,
    });
  },
});
