import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { NodeDefinition } from '@codaco/protocol-validation';
import type { DyadCensusMetadataItem } from '@codaco/shared-consts';

import protocolReducer from '../../store/modules/protocol';
import sessionReducer, {
  createInitialNetwork,
  updateStageMetadata,
} from '../../store/modules/session';
import uiReducer from '../../store/modules/ui';
import { getStageMetadata, resolveNodeShape } from '../session';

const rootReducer = combineReducers({
  session: sessionReducer,
  protocol: protocolReducer,
  ui: uiReducer,
});

function createStore() {
  const sessionState = {
    id: 'test-session',
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: createInitialNetwork(),
    promptIndex: 0,
  };

  return configureStore({
    reducer: rootReducer,
    preloadedState: { session: sessionState },
  });
}

describe('getStageMetadata', () => {
  it('reads back metadata written at stage index 0', () => {
    // A DyadCensus/TieStrengthCensus may be the first stage (index 0). The
    // reducer writes stageMetadata at the current step regardless of index, so
    // the selector must be able to read index 0 back (it previously treated 0
    // as falsy and returned undefined).
    const metadata: DyadCensusMetadataItem[] = [[0, 'a', 'b', false]];
    const store = createStore();

    store.dispatch(updateStageMetadata({ currentStep: 0, metadata }));

    expect(getStageMetadata(store.getState(), 0)).toEqual(metadata);
  });

  it('returns metadata for a non-zero stage index', () => {
    const metadata: DyadCensusMetadataItem[] = [[1, 'a', 'b', false]];
    const store = createStore();

    store.dispatch(updateStageMetadata({ currentStep: 2, metadata }));

    expect(getStageMetadata(store.getState(), 2)).toEqual(metadata);
  });

  it('returns undefined when no metadata exists for the stage', () => {
    const store = createStore();

    expect(getStageMetadata(store.getState(), 0)).toBeUndefined();
  });
});

describe('resolveNodeShape', () => {
  it('matches an array-valued categorical attribute against a discrete map entry', () => {
    // Categorical (multi-select) variables store their value as an array, e.g.
    // ['asian']. The discrete mapping values are scalars, so the resolver must
    // match array members rather than comparing the whole array by identity.
    const shape: NodeDefinition['shape'] = {
      default: 'circle',
      dynamic: {
        variable: 'ethnicity',
        type: 'discrete',
        map: [
          { value: 'asian', shape: 'square' },
          { value: 'white', shape: 'diamond' },
        ],
      },
    };

    expect(resolveNodeShape(shape, { ethnicity: ['asian'] })).toBe('square');
  });

  it('matches a scalar-valued attribute against a discrete map entry', () => {
    const shape: NodeDefinition['shape'] = {
      default: 'circle',
      dynamic: {
        variable: 'role',
        type: 'discrete',
        map: [{ value: 'lead', shape: 'diamond' }],
      },
    };

    expect(resolveNodeShape(shape, { role: 'lead' })).toBe('diamond');
  });
});
