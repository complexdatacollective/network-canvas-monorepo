import { createAsyncThunk } from '@reduxjs/toolkit';

import type { RootState } from './store';

/**
 * `createAsyncThunk` pre-typed with the store's `RootState`, so thunk `getState()`
 * returns `RootState` without a per-call `as RootState` cast. Only `state` is
 * pinned; typing `dispatch` too makes the produced action undispatchable by the
 * store's own dispatch (extra-arg `unknown`/`undefined` mismatch).
 */
export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState;
}>();
