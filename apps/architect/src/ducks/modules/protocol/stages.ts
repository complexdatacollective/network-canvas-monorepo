import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';
import { compact } from 'es-toolkit/compat';
import { v1 as uuid } from 'uuid';

import type { SkipLogicDestination, Stage } from '@codaco/protocol-validation';
import { createAppAsyncThunk } from '~/ducks/createAppAsyncThunk';
import { getNodeTypes } from '~/selectors/codebook';
import { getProtocol, getStage } from '~/selectors/protocol';
import prune from '~/utils/prune';

import { updateVariableByUUID } from './codebook';

type StagesState = Stage[];

type CreateStagePayload = {
  stage: Stage;
  index?: number;
};

type UpdateStagePayload = {
  stageId: string;
  stage: Partial<Stage>;
  overwrite?: boolean;
};

type MoveStagePayload = {
  oldIndex: number;
  newIndex: number;
};

type DeletePromptPayload = {
  stageId: string;
  promptId: string | number;
  deleteEmptyStage?: boolean;
};

// Initial state
const initialState: StagesState = [];

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

// A NarrativePedigree's diseases bind variables on the source FamilyPedigree
// stage's nodeConfig.type, so changing that node type would leave those
// references dangling against the new type. Returns the dependent stages that
// block the change, mirroring the deletion guard above.
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
const createStageAsync = createAppAsyncThunk(
  'stages/createStageAsync',
  async (
    { options, index }: { options: Partial<Stage>; index?: number },
    { dispatch },
  ) => {
    const stageId = uuid();
    const stage = { ...initialStage, ...options, id: stageId } as Stage;

    dispatch(stagesSlice.actions.createStage({ stage, index }));
    return stage;
  },
);

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

    if (stage?.type === 'Anonymisation') {
      // Remove encrypted from all variables
      const nodeTypes = getNodeTypes(state);
      const encryptedVariables = Object.values(nodeTypes).reduce(
        (
          acc: Array<{
            id: string;
            encrypted?: boolean;
            [key: string]: unknown;
          }>,
          nodeType: {
            variables?: Record<
              string,
              { encrypted?: boolean; [key: string]: unknown }
            >;
          },
        ) => {
          const nodeTypeVariables = Object.entries(nodeType.variables || {})
            .filter(([, variable]) => variable.encrypted)
            .map(([variableId, variable]) => ({ ...variable, id: variableId }));

          acc.push(...nodeTypeVariables);
          return acc;
        },
        [],
      );

      await Promise.all(
        encryptedVariables.map((variable) =>
          dispatch(
            updateVariableByUUID(variable.id, {}, ['encrypted']),
          ).unwrap(),
        ),
      );
    }

    dispatch(stagesSlice.actions.deleteStage(stageId));
    return stageId;
  },
);

// Stages slice
const stagesSlice = createSlice({
  name: 'stages',
  initialState,
  reducers: {
    createStage: (state, action: PayloadAction<CreateStagePayload>) => {
      const { stage, index } = action.payload;
      const insertAtIndex = index ?? state.length;

      const prunedStage = prune(stage);
      state.splice(insertAtIndex, 0, prunedStage);
    },
    updateStage: (state, action: PayloadAction<UpdateStagePayload>) => {
      const { stageId, stage: stageUpdate, overwrite = false } = action.payload;

      const stageIndex = state.findIndex((stage) => stage.id === stageId);
      if (stageIndex === -1) return;

      const currentStage = state[stageIndex];
      invariant(currentStage, `Stage with ID ${stageId} not found`);

      const previousStage = !overwrite ? currentStage : ({} as Partial<Stage>);

      const newStage: Stage = {
        ...previousStage,
        ...stageUpdate,
        id: currentStage.id,
      } as Stage;

      state[stageIndex] = prune(newStage);
    },
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
    deleteStage: (state, action: PayloadAction<string>) => {
      const stageId = action.payload;

      if (isStageReferencedAsSkipDestination(state, stageId)) {
        return;
      }

      return state.filter((stage) => stage.id !== stageId);
    },
    deletePrompt: (state, action: PayloadAction<DeletePromptPayload>) => {
      const { stageId, promptId, deleteEmptyStage = false } = action.payload;
      const stageIsSkipDestination = isStageReferencedAsSkipDestination(
        state,
        stageId,
      );

      if (deleteEmptyStage && stageIsSkipDestination) {
        const targetStage = state.find((stage) => stage.id === stageId);

        if (
          targetStage &&
          'prompts' in targetStage &&
          (targetStage.prompts?.filter(({ id }) => id !== promptId).length ??
            0) === 0
        ) {
          return;
        }
      }

      return compact(
        state.map((stage) => {
          if (stage.id !== stageId) {
            return stage;
          }

          invariant(
            'prompts' in stage,
            `Stage with ID ${stageId} has no prompts to delete`,
          );

          const prompts =
            stage.prompts?.filter(({ id }) => id !== promptId) || [];

          // If prompt is empty, we can delete the stage too
          if (deleteEmptyStage && prompts.length === 0) {
            return null;
          }

          return {
            ...stage,
            prompts,
          };
        }),
      ) as Stage[];
    },
  },
});

// Export slice actions for middleware listeners
export const createStage = stagesSlice.actions.createStage;

// Export action creators (thunks)
export const actionCreators = {
  createStage: createStageAsync,
  updateStage: (stageId: string, stage: Partial<Stage>, overwrite = false) =>
    stagesSlice.actions.updateStage({ stageId, stage, overwrite }),
  deleteStage: deleteStageAsync,
  moveStage: (oldIndex: number, newIndex: number) =>
    stagesSlice.actions.moveStage({ oldIndex, newIndex }),
  deletePrompt: (
    stageId: string,
    promptId: string | number,
    deleteEmptyStage = false,
  ) =>
    stagesSlice.actions.deletePrompt({ stageId, promptId, deleteEmptyStage }),
};

// Export for backwards compatibility and testing
export const test = {
  createStage: (stage: Stage, index?: number) =>
    stagesSlice.actions.createStage({ stage, index }),
  updateStage: (stageId: string, stage: Partial<Stage>, overwrite = false) =>
    stagesSlice.actions.updateStage({ stageId, stage, overwrite }),
  deleteStage: (stageId: string) => stagesSlice.actions.deleteStage(stageId),
  moveStage: (oldIndex: number, newIndex: number) =>
    stagesSlice.actions.moveStage({ oldIndex, newIndex }),
  deletePrompt: (
    stageId: string,
    promptId: string | number,
    deleteEmptyStage = false,
  ) =>
    stagesSlice.actions.deletePrompt({ stageId, promptId, deleteEmptyStage }),
};

// Note: StagesState is only used internally

// Export the reducer as default
export default stagesSlice.reducer;
