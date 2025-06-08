import { compact, get, omit } from "es-toolkit/compat";
import { v1 as uuid } from "uuid";
import { getStage } from "~/selectors/protocol";
import prune from "~/utils/prune";
import { saveableChange } from "../../saveableChange";

import { getNodeTypes } from "../../../../selectors/codebook";

const CREATE_STAGE = "PROTOCOL/CREATE_STAGE";
const UPDATE_STAGE = "PROTOCOL/UPDATE_STAGE";
const MOVE_STAGE = "PROTOCOL/MOVE_STAGE";
const DELETE_STAGE = "PROTOCOL/DELETE_STAGE";
const DELETE_PROMPT = "PROTOCOL/DELETE_PROMPT";

const initialState = [];
const initialStage = {
	label: "",
};

export default function reducer(state = initialState, action = {}) {
	switch (action.type) {
		case CREATE_STAGE: {
			const insertAtIndex = get(action, "index", state.length);

			return [...state.slice(0, insertAtIndex), prune(action.stage), ...state.slice(insertAtIndex)];
		}
		case UPDATE_STAGE:
			return state.map((stage) => {
				if (stage.id !== action.id) {
					return stage;
				}

				const previousStage = !action.overwrite ? stage : {};

				const newStage = {
					...previousStage,
					...action.stage,
					id: stage.id,
				};

				return prune(newStage);
			});
		case MOVE_STAGE:
			return console.warn("MOVE_STAGE is not implemented yet, this will not work as expected.");
		// return arrayMove(state, action.oldIndex, action.newIndex);
		case DELETE_STAGE:
			return state.filter((stage) => stage.id !== action.id);
		case DELETE_PROMPT:
			return compact(
				state.map((stage) => {
					if (stage.id !== action.stageId) {
						return stage;
					}

					const prompts = stage.prompts.filter(({ id }) => id !== action.promptId);

					// If prompt is empty, we can delete the stage too
					if (action.deleteEmptyStage && prompts.length === 0) {
						return null;
					}

					return {
						...stage,
						prompts,
					};
				}),
			);
		default:
			return state;
	}
}

const createStage = (stage, index) => ({
	type: CREATE_STAGE,
	stage,
	index,
});

const moveStage = (oldIndex, newIndex) => ({
	type: MOVE_STAGE,
	oldIndex,
	newIndex,
});

const updateStage = (stageId, stage, overwrite = false) => ({
	type: UPDATE_STAGE,
	id: stageId,
	stage,
	overwrite,
});

const deleteStage = (stageId) => ({
	type: DELETE_STAGE,
	id: stageId,
});

const deletePrompt = (stageId, promptId, deleteEmptyStage = false) => ({
	type: DELETE_PROMPT,
	stageId,
	promptId,
	deleteEmptyStage,
});

const createStageThunk = (options, index) => (dispatch) => {
	const stageId = uuid();
	const stage = { ...initialStage, ...options, id: stageId };
	return dispatch(saveableChange(createStage)(stage, index)).then(() => stage);
};

const moveStageThunk = saveableChange(moveStage);
const updateStageThunk = saveableChange(updateStage);
const deleteStageThunk = (stageId) => (dispatch, getState) => {
	const state = getState();
	const stage = getStage(state, stageId);
	if (stage.type === "Anonymisation") {
		// Remove encrypted from all variables
		const nodeTypes = getNodeTypes(state);
		const encryptedVariables = Object.values(nodeTypes).reduce((acc, nodeType) => {
			const nodeTypeVariables = Object.entries(nodeType.variables)
				.filter(([, variable]) => variable.encrypted)
				.map(([variableId, variable]) => ({ ...variable, id: variableId }));

			return [...acc, ...nodeTypeVariables];
		}, []);
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
		return dispatch(saveableChange(deleteStage)(stageId));
	}

	// Delete stage
	return dispatch(saveableChange(deleteStage)(stageId));
};

const deletePromptThunk = saveableChange(deletePrompt);

const actionCreators = {
	createStage: createStageThunk,
	updateStage: updateStageThunk,
	deleteStage: deleteStageThunk,
	moveStage: moveStageThunk,
	deletePrompt: deletePromptThunk,
};

const actionTypes = {
	CREATE_STAGE,
	UPDATE_STAGE,
	DELETE_STAGE,
	MOVE_STAGE,
	DELETE_PROMPT,
};

const test = {
	createStage,
	updateStage,
	deleteStage,
	moveStage,
	deletePrompt,
};

export { actionCreators, actionTypes, test };
