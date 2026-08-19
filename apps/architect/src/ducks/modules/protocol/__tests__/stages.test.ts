import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import type { AppDispatch } from '~/ducks/store';

import { commitStageEditorDraft } from '../commitStageEditorDraft';
import reducer, {
  actionCreators,
  getFamilyPedigreeNodeTypeChangeBlock,
  getInvalidSkipDestinationReferences,
  getSkipDestinationDependentStages,
  test,
} from '../stages';

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

describe('protocol.stages', () => {
  describe('reducer', () => {
    // Stage creation happens only as half of the stage editor's atomic
    // commit; there is no standalone create action to insert a stage.
    describe('commitStageEditorDraft (create)', () => {
      it('Creates a stage', () => {
        const newStage = { id: 'new', type: 'Information', label: '' } as Stage;

        const appendStageToState = reducer(
          mockStages,
          commitStageEditorDraft({
            stageId: null,
            stage: newStage,
            codebook: null,
          }),
        );
        expect(appendStageToState[3]).toMatchObject({ ...newStage });

        const addStageToExistingState = reducer(
          mockStages,
          commitStageEditorDraft({
            stageId: null,
            stage: newStage,
            index: 1,
            codebook: null,
          }),
        );
        expect(addStageToExistingState[1]).toMatchObject({ ...newStage });
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

    describe('skip destination ordering', () => {
      const stagesWithDestination = [
        {
          id: 'source',
          type: 'Information',
          label: 'Source',
          skipLogic: {
            action: 'SKIP',
            filter: { join: 'AND', rules: [] },
            destination: { type: 'stage', stageId: 'destination' },
          },
        },
        { id: 'middle', type: 'Information', label: 'Middle' },
        { id: 'destination', type: 'Information', label: 'Destination' },
      ] as Stage[];

      it('finds stages that depend on a destination', () => {
        expect(
          getSkipDestinationDependentStages(
            stagesWithDestination,
            'destination',
          ).map((stage) => stage.id),
        ).toEqual(['source']);
      });

      it('rejects deleting a referenced destination', () => {
        const updatedStages = reducer(
          stagesWithDestination,
          test.deleteStage('destination'),
        );

        expect(updatedStages).toEqual(stagesWithDestination);
      });

      it('rejects a reorder that moves the destination before its source', () => {
        const updatedStages = reducer(
          stagesWithDestination,
          test.moveStage(2, 0),
        );

        expect(updatedStages).toEqual(stagesWithDestination);
      });

      it('allows a reorder that keeps the destination later than its source', () => {
        const updatedStages = reducer(
          stagesWithDestination,
          test.moveStage(1, 2),
        );

        expect(updatedStages.map((stage) => stage.id)).toEqual([
          'source',
          'destination',
          'middle',
        ]);
      });

      it('reports a missing destination as invalid', () => {
        const [violation] = getInvalidSkipDestinationReferences([
          stagesWithDestination[0] as Stage,
        ]);

        expect(violation?.sourceStage.id).toBe('source');
        expect(violation?.destinationStage).toBeUndefined();
        expect(violation?.destinationStageId).toBe('destination');
      });
    });

    describe('getFamilyPedigreeNodeTypeChangeBlock', () => {
      const familyPedigreeWithDependent = [
        { id: 'fp', type: 'FamilyPedigree', label: 'Family Pedigree' },
        {
          id: 'np',
          type: 'NarrativePedigree',
          label: 'Narrative Pedigree',
          sourceStageId: 'fp',
        },
      ] as Stage[];

      it('returns dependent NarrativePedigree stages when present', () => {
        expect(
          getFamilyPedigreeNodeTypeChangeBlock(
            familyPedigreeWithDependent,
            'fp',
          ).map((stage) => stage.id),
        ).toEqual(['np']);
      });

      it('returns nothing when no NarrativePedigree sources the stage', () => {
        const withoutDependent = [
          { id: 'fp', type: 'FamilyPedigree', label: 'Family Pedigree' },
          {
            id: 'np',
            type: 'NarrativePedigree',
            label: 'Narrative Pedigree',
            sourceStageId: 'other',
          },
        ] as Stage[];

        expect(
          getFamilyPedigreeNodeTypeChangeBlock(withoutDependent, 'fp'),
        ).toEqual([]);
      });
    });
  });

  describe('async action creators', () => {
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
      it('blocks deleting a stage used as a skip destination', async () => {
        const present = {
          stages: [
            {
              id: 'source',
              type: 'Information',
              label: 'Source',
              skipLogic: {
                action: 'SKIP',
                filter: { join: 'AND', rules: [] },
                destination: { type: 'stage', stageId: 'destination' },
              },
            },
            {
              id: 'destination',
              type: 'Information',
              label: 'Destination',
            },
          ],
          codebook: { node: {} },
        };
        const { store, dispatched } = createThunkStore(present);

        await store.dispatch(actionCreators.deleteStage('destination'));

        expect(dispatched.some((a) => a.type === 'stages/deleteStage')).toBe(
          false,
        );
      });

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

        const deleteStageAction = dispatched.find(
          (a) => a.type === 'stages/deleteStage',
        );
        expect(deleteStageAction).toBeDefined();
        expect(
          dispatched.some((a) => a.type === 'PROTOCOL/UPDATE_VARIABLE'),
        ).toBe(false);
        expect(
          dispatched.filter(
            (a) =>
              a.type === 'stages/deleteStage' ||
              a.type === 'codebook/updateVariable',
          ),
        ).toHaveLength(1);

        const payload = deleteStageAction?.payload as
          | {
              stageId: string;
              clearEncryptedVariables: boolean;
            }
          | undefined;
        expect(payload).toEqual({
          stageId: 'anon',
          clearEncryptedVariables: true,
        });

        expect(dispatched.some((a) => a.type === 'stages/deleteStage')).toBe(
          true,
        );
      });
    });
  });

  describe('sync action creators', () => {
    it('moveStage', () => {
      const action = actionCreators.moveStage(2, 1);
      expect(action.type).toBe('stages/moveStage');
      expect(action.payload).toEqual({ oldIndex: 2, newIndex: 1 });
    });
  });
});
