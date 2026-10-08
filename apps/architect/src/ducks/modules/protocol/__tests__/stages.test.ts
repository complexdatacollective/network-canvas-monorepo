import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import type { LocalizedString, Stage } from '@codaco/protocol-validation';
import type { AppDispatch } from '~/ducks/store';

import { commitStage } from '../commitStage';
import reducer, {
  actionCreators,
  getFamilyPedigreeNodeTypeChangeBlock,
  getInvalidSkipDestinationReferences,
  getSkipDestinationDependentStages,
  isLastFinishStage,
  test,
} from '../stages';

// The stages below are deliberately partial: the reducers under test read only
// ids, types and references. Typing each label as a LocalizedString keeps them
// comparable to `Stage` for the assertions.
const localized = (text: string): LocalizedString => ({ en: text });

const mockStages = [
  { id: '3', type: 'Information', label: localized('Foo') },
  {
    id: '9',
    type: 'NameGenerator',
    label: localized('Bar'),
    prompts: [
      { id: '7', text: localized('prompt') },
      { id: '3', text: localized('prompt2') },
      { id: '5', text: localized('prompt3') },
    ],
  },
  { id: '5', type: 'OrdinalBin', label: localized('Baz') },
] as Stage[];

describe('protocol.stages', () => {
  describe('reducer', () => {
    // Stage creation happens only through the stage editor's save; there is
    // no standalone create action to insert a stage.
    describe('commitStage (create)', () => {
      it('Creates a stage', () => {
        const newStage = {
          id: 'new',
          type: 'Information',
          label: localized(''),
        } as Stage;

        const appendStageToState = reducer(
          mockStages,
          commitStage({
            stageId: null,
            stage: newStage,
          }),
        );
        expect(appendStageToState[3]).toMatchObject({ ...newStage });

        const addStageToExistingState = reducer(
          mockStages,
          commitStage({
            stageId: null,
            stage: newStage,
            index: 1,
          }),
        );
        expect(addStageToExistingState[1]).toMatchObject({ ...newStage });
      });
    });

    describe('deleteStage', () => {
      it('Deletes the stage with stageId', () => {
        const updatedStages = reducer(mockStages, test.deleteStage('9'));

        expect(updatedStages).toEqual([
          { id: '3', type: 'Information', label: localized('Foo') },
          { id: '5', type: 'OrdinalBin', label: localized('Baz') },
        ]);
      });
    });

    describe('the finish stage', () => {
      const finish = {
        id: 'finish',
        type: 'FinishSession',
        label: localized('Finish'),
        title: localized('All done'),
        content: localized('Thank you.'),
        outcome: 'completed',
      } as Stage;
      const withFinish = [...mockStages, finish];
      const ids = (stages: readonly Stage[]) => stages.map(({ id }) => id);

      it('puts a new stage before the finish stage, wherever it was asked to go', () => {
        const newStage = {
          id: 'new',
          type: 'Information',
          label: localized('New'),
        } as Stage;
        for (const index of [undefined, 3, 4, 10]) {
          expect(
            ids(
              reducer(
                withFinish,
                commitStage({ stageId: null, stage: newStage, index }),
              ),
            ),
          ).toEqual(['3', '9', '5', 'new', 'finish']);
        }
        expect(
          ids(
            reducer(
              withFinish,
              commitStage({ stageId: null, stage: newStage, index: 1 }),
            ),
          ),
        ).toEqual(['3', 'new', '9', '5', 'finish']);
      });

      it('refuses to delete the only finish stage', () => {
        expect(isLastFinishStage(withFinish, 'finish')).toBe(true);
        expect(reducer(withFinish, test.deleteStage('finish'))).toEqual(
          withFinish,
        );
      });

      it('deletes a finish stage when another one remains', () => {
        const twoFinishes = [...withFinish, { ...finish, id: 'finish-2' }];
        expect(isLastFinishStage(twoFinishes, 'finish')).toBe(false);
        expect(ids(reducer(twoFinishes, test.deleteStage('finish')))).toEqual([
          '3',
          '9',
          '5',
          'finish-2',
        ]);
      });

      it('refuses a move that would take the finish stage off the end', () => {
        expect(reducer(withFinish, test.moveStage(3, 1))).toEqual(withFinish);
      });

      it('refuses a move that would put a stage after the finish stage', () => {
        expect(reducer(withFinish, test.moveStage(0, 3))).toEqual(withFinish);
      });

      it('never moves the finish stage, even towards the end', () => {
        const outOfPlace = [mockStages[0]!, finish, ...mockStages.slice(1)];
        expect(reducer(outOfPlace, test.moveStage(1, 3))).toEqual(outOfPlace);
      });

      it('never adds a second finish stage', () => {
        for (const index of [undefined, 0, 3, 4]) {
          expect(
            reducer(
              withFinish,
              commitStage({
                stageId: null,
                stage: { ...finish, id: 'finish-2' },
                index,
              }),
            ),
          ).toEqual(withFinish);
        }
      });

      it('moves stages around before the finish stage', () => {
        expect(ids(reducer(withFinish, test.moveStage(0, 2)))).toEqual([
          '9',
          '5',
          '3',
          'finish',
        ]);
      });
    });

    describe('skip destination ordering', () => {
      const stagesWithDestination = [
        {
          id: 'source',
          type: 'Information',
          label: localized('Source'),
          skipLogic: {
            action: 'SKIP',
            filter: { join: 'AND', rules: [] },
            destination: { type: 'stage', stageId: 'destination' },
          },
        },
        { id: 'middle', type: 'Information', label: localized('Middle') },
        {
          id: 'destination',
          type: 'Information',
          label: localized('Destination'),
        },
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
        {
          id: 'fp',
          type: 'FamilyPedigree',
          label: localized('Family Pedigree'),
        },
        {
          id: 'np',
          type: 'NarrativePedigree',
          label: localized('Narrative Pedigree'),
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
          {
            id: 'fp',
            type: 'FamilyPedigree',
            label: localized('Family Pedigree'),
          },
          {
            id: 'np',
            type: 'NarrativePedigree',
            label: localized('Narrative Pedigree'),
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
              label: localized('Source'),
              skipLogic: {
                action: 'SKIP',
                filter: { join: 'AND', rules: [] },
                destination: { type: 'stage', stageId: 'destination' },
              },
            },
            {
              id: 'destination',
              type: 'Information',
              label: localized('Destination'),
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
              label: localized('Pedigree'),
            },
            {
              id: 'np',
              type: 'NarrativePedigree',
              label: localized('Narrative'),
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
          stages: [
            { id: 'fp', type: 'FamilyPedigree', label: localized('Pedigree') },
          ],
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
          stages: [
            { id: 'anon', type: 'Anonymisation', label: localized('Anon') },
          ],
          codebook: {
            node: {
              person: {
                name: 'Person',
                label: localized('Person'),
                variables: {
                  ssn: {
                    name: 'ssn',
                    label: 'ssn',
                    type: 'text',
                    encrypted: true,
                  },
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
