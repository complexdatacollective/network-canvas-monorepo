import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type NodeDefinition,
} from '@codaco/protocol-validation';
import type { DyadCensusMetadataItem } from '@codaco/shared-consts';

import { createInitialNetwork } from '../../contract/network';
import protocolReducer from '../../store/modules/protocol';
import sessionReducer, {
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
        variable: asEntityAttributeReference('ethnicity'),
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
        variable: asEntityAttributeReference('role'),
        type: 'discrete',
        map: [{ value: 'lead', shape: 'diamond' }],
      },
    };

    expect(resolveNodeShape(shape, { role: 'lead' })).toBe('diamond');
  });

  /**
   * The breakpoints branch, which the Architect editor writes and nothing here
   * covered. Thresholds are inclusive lower bounds scanned from the top, so n
   * of them describe n+1 bands — which is why the schema caps them at two.
   */
  describe('breakpoints', () => {
    type Thresholds = Extract<
      NonNullable<NodeDefinition['shape']['dynamic']>,
      { type: 'breakpoints' }
    >['thresholds'];

    const shape = (thresholds: Thresholds): NodeDefinition['shape'] => ({
      default: 'circle',
      dynamic: {
        variable: asEntityAttributeReference('age'),
        type: 'breakpoints',
        thresholds,
      },
    });

    it('treats a threshold as an inclusive lower bound', () => {
      const definition = shape([{ value: 18, shape: 'square' }]);

      expect(resolveNodeShape(definition, { age: 18 })).toBe('square');
      expect(resolveNodeShape(definition, { age: 19 })).toBe('square');
    });

    it('falls back to the default below the lowest threshold', () => {
      const definition = shape([{ value: 18, shape: 'square' }]);

      expect(resolveNodeShape(definition, { age: 17 })).toBe('circle');
    });

    it('gives two thresholds three bands', () => {
      const definition = shape([
        { value: 18, shape: 'square' },
        { value: 65, shape: 'diamond' },
      ]);

      expect(resolveNodeShape(definition, { age: 0 })).toBe('circle');
      expect(resolveNodeShape(definition, { age: 18 })).toBe('square');
      expect(resolveNodeShape(definition, { age: 64 })).toBe('square');
      expect(resolveNodeShape(definition, { age: 65 })).toBe('diamond');
      expect(resolveNodeShape(definition, { age: 120 })).toBe('diamond');
    });

    it('falls back to the default for an answer that is not a number', () => {
      const definition = shape([{ value: 18, shape: 'square' }]);

      // Including the string form of a number the threshold would otherwise
      // meet: the comparison is numeric, and a coerced string would make a
      // text answer silently change a node's shape.
      expect(resolveNodeShape(definition, { age: '20' })).toBe('circle');
      expect(resolveNodeShape(definition, { age: null })).toBe('circle');
      expect(resolveNodeShape(definition, {})).toBe('circle');
    });
  });

  it('maps a true boolean attribute and falls back for other values', () => {
    const shape: NodeDefinition['shape'] = {
      default: 'square',
      dynamic: {
        variable: asEntityAttributeReference('is_person'),
        type: 'discrete',
        map: [{ value: true, shape: 'circle' }],
      },
    };

    expect(resolveNodeShape(shape, { is_person: true })).toBe('circle');
    expect(resolveNodeShape(shape, { is_person: false })).toBe('square');
    expect(resolveNodeShape(shape, {})).toBe('square');
    expect(resolveNodeShape(shape, { is_person: null })).toBe('square');
  });
});
