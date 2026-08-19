import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { SkipLogicDestination, Stage } from '@codaco/protocol-validation';
import { createAppAsyncThunk } from '~/ducks/createAppAsyncThunk';
import { getProtocol, getStage } from '~/selectors/protocol';
import prune from '~/utils/prune';

import { commitStageEditorDraft } from './commitStageEditorDraft';
import { deleteStage } from './deleteStage';

type StagesState = Stage[];

type MoveStagePayload = {
  oldIndex: number;
  newIndex: number;
};

// Initial state
const initialState: StagesState = [];

// The base every newly created stage is built on. Kept as a spread base rather
// than a fallback so a created stage's key order stays `label, id, type, …`,
// which the committed interface snapshots record.
const initialStage = {
  label: '',
};

type StageDependencyCandidate = Pick<Stage, 'id' | 'label' | 'type'> & {
  sourceStageId?: string;
  skipLogic?: {
    destination?: SkipLogicDestination;
  };
};

export const getFamilyPedigreeDependentStages = <
  T extends StageDependencyCandidate,
>(
  stages: T[],
  stageId: string,
) =>
  stages.filter(
    (candidate): candidate is T & { sourceStageId: string } =>
      candidate.type === 'NarrativePedigree' &&
      candidate.sourceStageId === stageId,
  );

export const getFamilyPedigreeNodeTypeChangeBlock = <
  T extends StageDependencyCandidate,
>(
  stages: T[],
  stageId: string,
) => getFamilyPedigreeDependentStages(stages, stageId);

export const getSkipDestinationDependentStages = <
  T extends StageDependencyCandidate,
>(
  stages: T[],
  stageId: string,
) =>
  stages.filter(
    (candidate) =>
      candidate.skipLogic?.destination?.type === 'stage' &&
      candidate.skipLogic.destination.stageId === stageId,
  );

const isStageReferencedAsSkipDestination = <T extends StageDependencyCandidate>(
  stages: T[],
  stageId: string,
) => getSkipDestinationDependentStages(stages, stageId).length > 0;

export const getInvalidSkipDestinationReferences = <
  T extends StageDependencyCandidate,
>(
  stages: T[],
) =>
  stages.flatMap((sourceStage, sourceIndex) => {
    const destination = sourceStage.skipLogic?.destination;

    if (destination?.type !== 'stage') {
      return [];
    }

    const destinationIndex = stages.findIndex(
      (stage) => stage.id === destination.stageId,
    );

    if (destinationIndex > sourceIndex) {
      return [];
    }

    return [
      {
        sourceStage,
        destinationStage: stages[destinationIndex],
        destinationStageId: destination.stageId,
      },
    ];
  });

// Async thunks
const deleteStageAsync = createAppAsyncThunk(
  'stages/deleteStageAsync',
  async (stageId: string, { dispatch, getState }) => {
    const state = getState();
    const stage = getStage(state, stageId);
    const allStages = getProtocol(state)?.stages ?? [];

    if (isStageReferencedAsSkipDestination(allStages, stageId)) {
      return stageId;
    }

    // A NarrativePedigree renders a FamilyPedigree's finalised network via
    // sourceStageId; deleting that source leaves the dependent stage invalid.
    if (stage?.type === 'FamilyPedigree') {
      const dependents = getFamilyPedigreeDependentStages(allStages, stageId);

      if (dependents.length > 0) {
        return stageId;
      }
    }

    dispatch(
      deleteStage({
        stageId,
        clearEncryptedVariables: stage?.type === 'Anonymisation',
      }),
    );
    return stageId;
  },
);

// Stages slice
const stagesSlice = createSlice({
  name: 'stages',
  initialState,
  reducers: {
    moveStage: (state, action: PayloadAction<MoveStagePayload>) => {
      const { oldIndex, newIndex } = action.payload;

      if (
        oldIndex < 0 ||
        oldIndex >= state.length ||
        newIndex < 0 ||
        newIndex >= state.length
      ) {
        return;
      }

      const reorderedStages = state.map((stage) => ({
        id: stage.id,
        label: stage.label,
        type: stage.type,
        skipLogic: stage.skipLogic
          ? { destination: stage.skipLogic.destination }
          : undefined,
      }));
      const [reorderedStage] = reorderedStages.splice(oldIndex, 1);
      if (!reorderedStage) {
        return;
      }
      reorderedStages.splice(newIndex, 0, reorderedStage);

      if (getInvalidSkipDestinationReferences(reorderedStages).length > 0) {
        return;
      }

      const movedStage = state[oldIndex];
      if (!movedStage) {
        return;
      }
      state.splice(oldIndex, 1);
      state.splice(newIndex, 0, movedStage);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(deleteStage, (state, action) => {
        const { stageId } = action.payload;

        if (isStageReferencedAsSkipDestination(state, stageId)) {
          return;
        }

        return state.filter((stage) => stage.id !== stageId);
      })
      // The stage half of the stage editor's atomic commit; `codebook` handles
      // the other half of the very same action. This is the ONLY way a stage is
      // created, and it always saves the whole stage (overwrite, not merge),
      // because a key the form no longer carries has been removed rather than
      // left untouched.
      .addCase(commitStageEditorDraft, (state, action) => {
        const { stageId, stage, index } = action.payload;

        if (!stageId) {
          state.splice(
            index ?? state.length,
            0,
            prune({ ...initialStage, ...stage }),
          );
          return;
        }

        const stageIndex = state.findIndex(({ id }) => id === stageId);
        if (stageIndex === -1) return;

        state[stageIndex] = prune({ ...stage, id: stageId });
      });
  },
});

// Export action creators (thunks)
//
// Writing a stage is NOT here: `commitStageEditorDraft` is the only way a stage
// is created or edited, because a stage write and the codebook write that goes
// with it have to land as one action (see the extra reducer above). The
// merge-in-place `updateStage` and `deletePrompt` reducers this slice used to
// carry were left with no callers by that change and have been deleted, so
// there is no second, non-transactional way back in.
export const actionCreators = {
  deleteStage: deleteStageAsync,
  moveStage: (oldIndex: number, newIndex: number) =>
    stagesSlice.actions.moveStage({ oldIndex, newIndex }),
};

// Export for backwards compatibility and testing
export const test = {
  deleteStage: (stageId: string) =>
    deleteStage({ stageId, clearEncryptedVariables: false }),
  moveStage: (oldIndex: number, newIndex: number) =>
    stagesSlice.actions.moveStage({ oldIndex, newIndex }),
};

// Note: StagesState is only used internally

// Export the reducer as default
export default stagesSlice.reducer;
