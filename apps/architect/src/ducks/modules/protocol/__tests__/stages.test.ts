import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import type { AppDispatch } from '~/ducks/store';

import reducer, { actionCreators, test } from '../stages';

const mockStages = [
  { id: '3', type: 'Information', label: 'Foo' },
  {
    id: '9',
    type: 'NameGenerator',
    label: 'Bar',
    prompts: [
      { id: '7', text: 'prompt' },
      { id: '3', text: 'prompt2' },
      { id: '5', text: 'prompt3' },
    ],
  },
  { id: '5', type: 'OrdinalBin', label: 'Baz' },
] as Stage[];

// Create a test store for async actions
const createTestStore = (initialStages: Stage[] = []) => {
  return configureStore({
    reducer: {
      stages: reducer,
      // Mock other reducers that might be needed
      protocol: () => ({
        present: {
          stages: initialStages,
        },
      }),
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
  });
};

describe('protocol.stages', () => {
  describe('reducer', () => {
    describe('createStage', () => {
      it('Creates a stage', () => {
        const newStage = { id: 'new', type: 'Information', label: '' } as Stage;

        const appendStageToState = reducer(
          mockStages,
          test.createStage(newStage),
        );
        expect(appendStageToState[3]).toMatchObject({ ...newStage });

        const addStageToExistingState = reducer(
          mockStages,
          test.createStage(newStage, 1),
        );
        expect(addStageToExistingState[1]).toMatchObject({ ...newStage });
      });
    });

    describe('updateStage', () => {
      it('Merges properties by default', () => {
        const updatedStage = { label: 'Hello world' };

        const updatedStages = reducer(
          mockStages,
          test.updateStage('9', updatedStage),
        );

        expect(updatedStages[1]).toMatchObject({
          label: 'Hello world',
          type: 'NameGenerator',
        });
      });

      it('Replaces stage object if overwrite is true', () => {
        const updatedStage = { something: 'different' } as unknown as Stage;

        const updatedStages = reducer(
          mockStages,
          test.updateStage('9', updatedStage, true),
        );

        expect(updatedStages[1]).toEqual({ id: '9', something: 'different' });
      });
    });

    describe('deleteStage', () => {
      it('Deletes the stage with stageId', () => {
        const updatedStages = reducer(mockStages, test.deleteStage('9'));

        expect(updatedStages).toEqual([
          { id: '3', type: 'Information', label: 'Foo' },
          { id: '5', type: 'OrdinalBin', label: 'Baz' },
        ]);
      });
    });

    describe('deletePrompt', () => {
      it('Deletes the prompt with promptId', () => {
        const updatedStages = reducer(mockStages, test.deletePrompt('9', '3'));

        expect(updatedStages).toEqual([
          { id: '3', type: 'Information', label: 'Foo' },
          {
            id: '9',
            type: 'NameGenerator',
            label: 'Bar',
            prompts: [
              { id: '7', text: 'prompt' },
              { id: '5', text: 'prompt3' },
            ],
          },
          { id: '5', type: 'OrdinalBin', label: 'Baz' },
        ]);
      });
    });
  });

  describe('async action creators', () => {
    it.todo('createStageAsync');

    const createThunkStore = (present: Record<string, unknown>) => {
      const dispatched: { type: string; payload?: unknown }[] = [];
      const recordDispatched = () => (next: (action: unknown) => unknown) => {
        return (action: unknown) => {
          if (action && typeof action === 'object' && 'type' in action) {
            dispatched.push(action as { type: string; payload?: unknown });
          }
          return next(action);
        };
      };

      const store = configureStore({
        reducer: {
          activeProtocol: () => ({ present }),
          stages: reducer,
          codebook: (state = present.codebook ?? {}) => state,
        },
        middleware: (getDefaultMiddleware) =>
          getDefaultMiddleware({ serializableCheck: false }).concat(
            recordDispatched,
          ),
      });

      // This mock store models only a few of the app's slices, so its inferred
      // dispatch type doesn't match the app thunks (pinned to the real
      // RootState). Bridge its dispatch to the real AppDispatch so the tests can
      // dispatch them.
      return {
        store: store as unknown as typeof store & { dispatch: AppDispatch },
        dispatched,
      };
    };

    describe('deleteStageAsync', () => {
      it('blocks deleting a FamilyPedigree referenced by a NarrativePedigree', async () => {
        const present = {
          stages: [
            {
              id: 'fp',
              type: 'FamilyPedigree',
              label: 'Pedigree',
            },
            {
              id: 'np',
              type: 'NarrativePedigree',
              label: 'Narrative',
              sourceStageId: 'fp',
            },
          ],
          codebook: { node: {} },
        };
        const { store, dispatched } = createThunkStore(present);

        await store.dispatch(actionCreators.deleteStage('fp'));

        expect(dispatched.some((a) => a.type === 'stages/deleteStage')).toBe(
          false,
        );
      });

      it('deletes a FamilyPedigree with no dependents', async () => {
        const present = {
          stages: [{ id: 'fp', type: 'FamilyPedigree', label: 'Pedigree' }],
          codebook: { node: {} },
        };
        const { store, dispatched } = createThunkStore(present);

        await store.dispatch(actionCreators.deleteStage('fp'));

        expect(dispatched.some((a) => a.type === 'stages/deleteStage')).toBe(
          true,
        );
      });

      it('strips encrypted from variables when deleting an Anonymisation stage', async () => {
        const present = {
          stages: [{ id: 'anon', type: 'Anonymisation', label: 'Anon' }],
          codebook: {
            node: {
              person: {
                name: 'Person',
                variables: {
                  ssn: { name: 'ssn', type: 'text', encrypted: true },
                },
              },
            },
          },
        };
        const { store, dispatched } = createThunkStore(present);

        await store.dispatch(actionCreators.deleteStage('anon'));

        // The real codebook updateVariable action is dispatched (not the dead
        // legacy PROTOCOL/UPDATE_VARIABLE type).
        const updateVariableAction = dispatched.find(
          (a) => a.type === 'codebook/updateVariable',
        );
        expect(updateVariableAction).toBeDefined();
        expect(
          dispatched.some((a) => a.type === 'PROTOCOL/UPDATE_VARIABLE'),
        ).toBe(false);

        // The cleanup config must drop both the synthetic `id` and the
        // `encrypted` flag rather than writing them back into the codebook.
        const configuration = (
          updateVariableAction?.payload as
            | { configuration: Record<string, unknown> }
            | undefined
        )?.configuration;
        expect(configuration).not.toHaveProperty('id');
        expect(configuration).not.toHaveProperty('encrypted');
        expect(configuration).toMatchObject({ name: 'ssn', type: 'text' });

        expect(dispatched.some((a) => a.type === 'stages/deleteStage')).toBe(
          true,
        );
      });
    });
  });

  describe('sync action creators', () => {
    it('updateStage', () => {
      const _store = createTestStore();

      const action = actionCreators.updateStage('9', { label: 'new label' });
      expect(action.type).toBe('stages/updateStage');
      expect(action.payload).toEqual({
        stageId: '9',
        stage: { label: 'new label' },
        overwrite: false,
      });
    });

    it('moveStage', () => {
      const action = actionCreators.moveStage(2, 1);
      expect(action.type).toBe('stages/moveStage');
      expect(action.payload).toEqual({ oldIndex: 2, newIndex: 1 });
    });

    it('deletePrompt', () => {
      const action = actionCreators.deletePrompt('9', '3');
      expect(action.type).toBe('stages/deletePrompt');
      expect(action.payload).toEqual({
        stageId: '9',
        promptId: '3',
        deleteEmptyStage: false,
      });
    });
  });
});
