import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { compact, omit } from "es-toolkit/compat";
import { v1 as uuid } from "uuid";
import type { RootState } from "~/ducks/modules/root";
import { getNodeTypes } from "~/selectors/codebook";
import { getStage } from "~/selectors/protocol";
import prune from "~/utils/prune";

// Types
type Stage = {
	id: string;
	type: string;
	label: string;
	prompts?: Array<{ id: string | number }>;
	[key: string]: any;
};

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
	label: "",
};

// Async thunks
export const createStageAsync = createAsyncThunk(
	"stages/createStageAsync",
	async ({ options, index }: { options: Partial<Stage>; index?: number }, { dispatch }) => {
		const stageId = uuid();
		const stage = { ...initialStage, ...options, id: stageId } as Stage;

		dispatch(stagesSlice.actions.createStage({ stage, index }));
		return stage;
	},
);

export const deleteStageAsync = createAsyncThunk(
	"stages/deleteStageAsync",
	async (stageId: string, { dispatch, getState }) => {
		const state = getState() as RootState;
		const stage = getStage(state, stageId);

		if (stage?.type === "Anonymisation") {
			// Remove encrypted from all variables
			const nodeTypes = getNodeTypes(state);
			const encryptedVariables = Object.values(nodeTypes).reduce((acc: any[], nodeType: any) => {
				const nodeTypeVariables = Object.entries(nodeType.variables || {})
					.filter(([, variable]: [string, any]) => variable.encrypted)
					.map(([variableId, variable]: [string, any]) => ({ ...variable, id: variableId }));

				return [...acc, ...nodeTypeVariables];
			}, []);

			// Note: This dispatches a codebook action - will need to be updated when codebook is modernized
			encryptedVariables.forEach((variable) => {
				const properties = omit(variable, "encrypted");

				dispatch({
					type: "PROTOCOL/UPDATE_VARIABLE",
					meta: {
						variable: variable.id,
					},
					configuration: properties,
					merge: false,
				});
			});
		}

		dispatch(stagesSlice.actions.deleteStage(stageId));
		return stageId;
	},
);

// Stages slice
const stagesSlice = createSlice({
	name: "stages",
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
			const previousStage = !overwrite ? currentStage : {};

			const newStage = {
				...previousStage,
				...stageUpdate,
				id: currentStage.id, // Preserve the original ID
			};

			state[stageIndex] = prune(newStage);
		},
		moveStage: (state, action: PayloadAction<MoveStagePayload>) => {
			const { oldIndex, newIndex } = action.payload;

			if (oldIndex < 0 || oldIndex >= state.length || newIndex < 0 || newIndex >= state.length) {
				console.warn("moveStage: invalid index");
				return;
			}

			// Remove the item from oldIndex
			const [movedStage] = state.splice(oldIndex, 1);
			// Insert it at newIndex
			state.splice(newIndex, 0, movedStage);
		},
		deleteStage: (state, action: PayloadAction<string>) => {
			const stageId = action.payload;
			return state.filter((stage) => stage.id !== stageId);
		},
		deletePrompt: (state, action: PayloadAction<DeletePromptPayload>) => {
			const { stageId, promptId, deleteEmptyStage = false } = action.payload;

			return compact(
				state.map((stage) => {
					if (stage.id !== stageId) {
						return stage;
					}

					const prompts = stage.prompts?.filter(({ id }) => id !== promptId) || [];

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

// Export actions
export const { createStage, updateStage, moveStage, deleteStage, deletePrompt } = stagesSlice.actions;

// Export action creators (thunks)
export const actionCreators = {
	createStage: createStageAsync,
	updateStage: (stageId: string, stage: Partial<Stage>, overwrite = false) =>
		stagesSlice.actions.updateStage({ stageId, stage, overwrite }),
	deleteStage: deleteStageAsync,
	moveStage: (oldIndex: number, newIndex: number) => stagesSlice.actions.moveStage({ oldIndex, newIndex }),
	deletePrompt: (stageId: string, promptId: string | number, deleteEmptyStage = false) =>
		stagesSlice.actions.deletePrompt({ stageId, promptId, deleteEmptyStage }),
};

// Export for backwards compatibility and testing
export const test = {
	createStage: (stage: Stage, index?: number) => stagesSlice.actions.createStage({ stage, index }),
	updateStage: (stageId: string, stage: Partial<Stage>, overwrite = false) =>
		stagesSlice.actions.updateStage({ stageId, stage, overwrite }),
	deleteStage: (stageId: string) => stagesSlice.actions.deleteStage(stageId),
	moveStage: (oldIndex: number, newIndex: number) => stagesSlice.actions.moveStage({ oldIndex, newIndex }),
	deletePrompt: (stageId: string, promptId: string | number, deleteEmptyStage = false) =>
		stagesSlice.actions.deletePrompt({ stageId, promptId, deleteEmptyStage }),
};

// Export types
export type { Stage, StagesState };

// Export the reducer as default
export default stagesSlice.reducer;
