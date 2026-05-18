/* eslint-disable import/prefer-default-export */

import { combineReducers, type UnknownAction } from '@reduxjs/toolkit';
import { reducer as formReducer } from 'redux-form';

import createTimeline from '../middleware/timeline';
import activeProtocol from './activeProtocol';
import app from './app';
import dialogs from './dialogs';
import protocols from './protocols';
import protocolValidation from './protocolValidation';

const protocolPattern = /^(activeProtocol|stages|codebook|assetManifest)\//;
// Thunk-lifecycle actions dispatched by createAsyncThunk don't carry state mutations themselves;
// the slice actions dispatched inside the thunk body do. Excluding the lifecycle suffixes keeps
// one user-visible operation == one undo step. Without this, every protocol async thunk inflates
// history by 2 (pending + fulfilled), making Undo silently no-op on the first click.
const thunkLifecyclePattern = /\/(pending|fulfilled|rejected)$/;

type ActionWithMeta = UnknownAction & { meta?: { skipTimeline?: boolean } };

const timelineOptions = {
  exclude: (action: UnknownAction) => {
    const type = action.type.toString();
    return (
      !protocolPattern.test(type) ||
      thunkLifecyclePattern.test(type) ||
      (action as ActionWithMeta).meta?.skipTimeline === true
    );
  },
};

export const rootReducer = combineReducers({
  app,
  dialogs,
  form: formReducer,
  activeProtocol: createTimeline(activeProtocol, timelineOptions),
  protocols,
  protocolValidation,
});

// Export the root state type
export type RootState = ReturnType<typeof rootReducer>;
