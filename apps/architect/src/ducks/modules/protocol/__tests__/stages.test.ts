import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { familyPedigreeWordingIn } from '@codaco/interview/supplied-wording';
import { ProtocolObjectIdSchema } from '@codaco/protocol-validation';
import type { LocalizedString, Stage } from '@codaco/protocol-validation';
import type { AppDispatch } from '~/ducks/store';

import { commitStage } from '../commitStage';
import reducer, {
  actionCreators,
  creationIndex,
  getFamilyPedigreeNodeTypeChangeBlock,
  getInvalidSkipDestinationReferences,
  getSkipDestinationDependentStages,
  isLastFinishStage,
  test,
} from '../stages';

const SECOND_FINISH_ID = ProtocolObjectIdSchema.parse(
  '70c1e030-aad3-406c-8bf0-3b98770712be',
);
const THIRD_FINISH_ID = ProtocolObjectIdSchema.parse(
  '72d778b4-8eee-4007-8b94-9d4ea39a56a6',
);
const FINISH_ID = ProtocolObjectIdSchema.parse(
  'a235a4e1-d840-4869-8949-b82e00894c81',
);

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
        id: FINISH_ID,
        type: 'FinishSession',
        label: localized('Finish'),
        mode: 'confirmation',
        content: localized('# All done\n\nThank you.'),
        finishedContent: localized('This interview is finished.'),
        finishLabel: localized('Finish'),
        finishConfirmation: localized('Finish this interview?'),
        finishFailed: localized('The interview could not be finished.'),
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
          ).toEqual(['3', '9', '5', 'new', FINISH_ID]);
        }
        expect(
          ids(
            reducer(
              withFinish,
              commitStage({ stageId: null, stage: newStage, index: 1 }),
            ),
          ),
        ).toEqual(['3', 'new', '9', '5', FINISH_ID]);
      });

      it('refuses to delete the only finish stage', () => {
        expect(isLastFinishStage(withFinish, FINISH_ID)).toBe(true);
        expect(reducer(withFinish, test.deleteStage(FINISH_ID))).toEqual(
          withFinish,
        );
      });

      it('deletes a finish stage when another one remains', () => {
        const twoFinishes = [
          ...withFinish,
          { ...finish, id: SECOND_FINISH_ID },
        ];
        expect(isLastFinishStage(twoFinishes, FINISH_ID)).toBe(false);
        expect(ids(reducer(twoFinishes, test.deleteStage(FINISH_ID)))).toEqual([
          '3',
          '9',
          '5',
          SECOND_FINISH_ID,
        ]);
      });

      it('refuses a move that would take the finish stage off the end', () => {
        expect(reducer(withFinish, test.moveStage(3, 1))).toEqual(withFinish);
      });

      it('refuses a move that would put a stage after the finish stage', () => {
        expect(reducer(withFinish, test.moveStage(0, 3))).toEqual(withFinish);
      });

      describe('with more than one finish stage', () => {
        const endings = [
          ...withFinish,
          { ...finish, id: SECOND_FINISH_ID },
          { ...finish, id: THIRD_FINISH_ID },
        ];

        it('moves finish stages among themselves', () => {
          expect(ids(reducer(endings, test.moveStage(5, 3)))).toEqual([
            '3',
            '9',
            '5',
            THIRD_FINISH_ID,
            FINISH_ID,
            SECOND_FINISH_ID,
          ]);
          expect(ids(reducer(endings, test.moveStage(3, 5)))).toEqual([
            '3',
            '9',
            '5',
            SECOND_FINISH_ID,
            THIRD_FINISH_ID,
            FINISH_ID,
          ]);
        });

        it('moves no finish stage above the first of them', () => {
          expect(reducer(endings, test.moveStage(5, 2))).toEqual(endings);
          expect(reducer(endings, test.moveStage(4, 0))).toEqual(endings);
        });

        it('moves no other stage among them', () => {
          expect(reducer(endings, test.moveStage(2, 3))).toEqual(endings);
          expect(reducer(endings, test.moveStage(0, 5))).toEqual(endings);
        });
      });

      it('adds another finish stage among the finish stages, or at the end', () => {
        const added = { ...finish, id: SECOND_FINISH_ID };
        for (const index of [undefined, 0, 2, 10]) {
          expect(
            ids(
              reducer(
                withFinish,
                commitStage({ stageId: null, stage: added, index }),
              ),
            ),
          ).toEqual(['3', '9', '5', FINISH_ID, SECOND_FINISH_ID]);
        }
        expect(
          ids(
            reducer(
              withFinish,
              commitStage({ stageId: null, stage: added, index: 3 }),
            ),
          ),
        ).toEqual(['3', '9', '5', SECOND_FINISH_ID, FINISH_ID]);
      });

      it('moves stages around before the finish stage', () => {
        expect(ids(reducer(withFinish, test.moveStage(0, 2)))).toEqual([
          '9',
          '5',
          '3',
          FINISH_ID,
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
          wording: familyPedigreeWordingIn(),
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
            wording: familyPedigreeWordingIn(),
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
              wording: familyPedigreeWordingIn(),
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
                variables: {
                  ssn: {
                    name: 'ssn',
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
    it('moveStage moves the stage at its first index to its second', () => {
      const moved = reducer(mockStages, actionCreators.moveStage(2, 0));
      expect(moved.map(({ id }) => id)).toEqual(['5', '3', '9']);
    });
  });
});

describe('creationIndex', () => {
  const stages = [
    { type: 'Information' },
    { type: 'NameGenerator' },
    { type: 'FinishSession' },
    { type: 'FinishSession' },
  ] as const;

  // The timeline's trailing add control asks for the very end.
  it('adds a finish stage asked for at the end after the existing endings', () => {
    expect(
      creationIndex(stages, { type: 'FinishSession' }, stages.length),
    ).toBe(4);
  });

  it('adds any other stage asked for at the end before the first ending', () => {
    expect(creationIndex(stages, { type: 'Information' }, stages.length)).toBe(
      2,
    );
  });

  it('adds a finish stage where it was asked for among the endings', () => {
    expect(creationIndex(stages, { type: 'FinishSession' }, 3)).toBe(3);
  });
});
