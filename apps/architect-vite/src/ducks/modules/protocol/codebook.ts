import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { find, get, has, isEmpty, omit } from "es-toolkit/compat";
import { v4 as uuid } from "uuid";
import type { RootState } from "~/ducks/modules/root";
import { getAllVariableUUIDsByEntity, getVariablesForSubject } from "~/selectors/codebook";
import { getIsUsed } from "~/selectors/codebook/isUsed";
import { makeGetUsageForType } from "~/selectors/usage";
import prune from "~/utils/prune";
import safeName from "~/utils/safeName";
import { actionCreators as stageActions } from "./stages";
import { getNextCategoryColor } from "./utils/helpers";

// Types
type Entity = "node" | "edge" | "ego";

type Variable = {
	name: string;
	type: string;
	[key: string]: unknown;
};

type EntityType = {
	name: string;
	color: string;
	iconVariant?: string;
	variables: Record<string, Variable>;
	[key: string]: unknown;
};

type CodebookState = {
	node: Record<string, EntityType>;
	edge: Record<string, EntityType>;
	ego?: {
		variables: Record<string, Variable>;
		[key: string]: unknown;
	};
};

type CreateTypePayload = {
	entity: Entity;
	type: string;
	configuration: Partial<EntityType>;
};

type UpdateTypePayload = {
	entity: Entity;
	type: string;
	configuration: Partial<EntityType>;
};

type DeleteTypePayload = {
	entity: Entity;
	type: string;
};

type CreateVariablePayload = {
	entity: Entity;
	type?: string;
	variable: string;
	configuration: Variable;
};

type UpdateVariablePayload = {
	variable: string;
	configuration: Partial<Variable>;
	merge?: boolean;
};

type DeleteVariablePayload = {
	entity: Entity;
	type?: string;
	variable: string;
};

// Initial state
const initialState: CodebookState = {
	edge: {},
	node: {},
};

const defaultTypeTemplate: Partial<EntityType> = {
	color: "",
	variables: {},
};

// Async thunks
export const createTypeAsync = createAsyncThunk(
	"codebook/createTypeAsync",
	async ({ entity, configuration }: { entity: Entity; configuration: Partial<EntityType> }, { dispatch }) => {
		const type = uuid();
		const payload: CreateTypePayload = {
			entity,
			type,
			configuration: {
				...defaultTypeTemplate,
				...configuration,
			},
		};

		dispatch(codebookSlice.actions.createType(payload));
		return { type, entity };
	},
);

export const updateTypeAsync = createAsyncThunk(
	"codebook/updateTypeAsync",
	async (
		{ entity, type, configuration }: { entity: Entity; type: string; configuration: Partial<EntityType> },
		{ dispatch },
	) => {
		const payload: UpdateTypePayload = { entity, type, configuration };
		dispatch(codebookSlice.actions.updateType(payload));
		return { type, entity };
	},
);

export const createEdgeAsync = createAsyncThunk(
	"codebook/createEdgeAsync",
	async (configuration: Partial<EntityType>, { dispatch, getState }) => {
		const entity: Entity = "edge";
		const state = getState() as RootState;
		const protocol = state.activeProtocol?.present || state.activeProtocol;
		const color = configuration.color ?? getNextCategoryColor(protocol, entity);
		const type = uuid();

		const payload: CreateTypePayload = {
			entity,
			type,
			configuration: { ...configuration, color },
		};

		dispatch(codebookSlice.actions.createType(payload));
		return { type, entity };
	},
);

export const createVariableAsync = createAsyncThunk(
	"codebook/createVariableAsync",
	async (
		{ entity, type, configuration }: { entity: Entity; type?: string; configuration: Partial<Variable> },
		{ dispatch, getState },
	) => {
		if (!configuration.name) {
			throw new Error("Cannot create a new variable without a name");
		}

		if (!configuration.type) {
			throw new Error("Cannot create a new variable without a type");
		}

		const safeConfiguration = {
			...configuration,
			name: safeName(configuration.name),
		} as Variable;

		if (isEmpty(safeConfiguration.name)) {
			throw new Error("Variable name contains no valid characters");
		}

		const state = getState() as RootState;
		const variables = getVariablesForSubject(state, { entity, type });
		const variableNameExists = Object.values(variables).some(({ name }) => name === safeConfiguration.name);

		// We can't use same variable name twice.
		if (variableNameExists) {
			throw new Error(`Variable with name "${safeConfiguration.name}" already exists`);
		}

		const variable = uuid();
		const payload: CreateVariablePayload = {
			entity,
			type,
			variable,
			configuration: safeConfiguration,
		};

		dispatch(codebookSlice.actions.createVariable(payload));
		return { entity, type, variable };
	},
);

export const updateVariableAsync = createAsyncThunk(
	"codebook/updateVariableAsync",
	async (
		{
			entity,
			type,
			variable,
			configuration,
			merge = false,
		}: {
			entity?: Entity;
			type?: string;
			variable: string;
			configuration: Partial<Variable>;
			merge?: boolean;
		},
		{ dispatch, getState },
	) => {
		if (!variable) {
			throw new Error("No variable provided to updateVariable()!");
		}

		// If entity and type are provided, validate the variable exists
		if (entity && type) {
			const state = getState() as RootState;
			const variableExists = has(getVariablesForSubject(state, { entity, type }), variable);

			if (!variableExists) {
				throw new Error(`Variable "${variable}" does not exist`);
			}
		}

		const payload: UpdateVariablePayload = {
			variable,
			configuration: prune(configuration),
			merge,
		};

		dispatch(codebookSlice.actions.updateVariable(payload));
		return payload;
	},
);

export const deleteVariableAsync = createAsyncThunk(
	"codebook/deleteVariableAsync",
	async ({ entity, type, variable }: { entity: Entity; type?: string; variable: string }, { dispatch, getState }) => {
		const state = getState() as RootState;
		const isUsed = getIsUsed(state);

		if (get(isUsed, variable, false)) {
			return false;
		}

		const payload: DeleteVariablePayload = { entity, type, variable };
		dispatch(codebookSlice.actions.deleteVariable(payload));
		return true;
	},
);

const getDeleteAction = ({ type, ...owner }: { type: string; id?: string; stageId?: string; promptId?: string }) => {
	switch (type) {
		case "stage":
			if (owner.id === undefined) {
				throw new Error("Stage ID is required for deleting a stage");
			}
			return stageActions.deleteStage(owner.id);
		case "prompt":
			if (owner.stageId === undefined || owner.promptId === undefined) {
				throw new Error("Stage ID and Prompt ID are required for deleting a prompt");
			}
			return stageActions.deletePrompt(owner.stageId, owner.promptId, true);
		default:
			// noop
			return { type: "NO_OP" };
	}
};

export const deleteTypeAsync = createAsyncThunk(
	"codebook/deleteTypeAsync",
	async (
		{
			entity,
			type,
			deleteRelatedObjects = false,
		}: {
			entity: Entity;
			type: string;
			deleteRelatedObjects?: boolean;
		},
		{ dispatch, getState },
	) => {
		const payload: DeleteTypePayload = { entity, type };
		dispatch(codebookSlice.actions.deleteType(payload));

		if (!deleteRelatedObjects) {
			return;
		}

		// Check usage elsewhere, and delete related stages/forms
		const state = getState() as RootState;
		const getUsageForType = makeGetUsageForType(state);
		const usageForType = getUsageForType(entity, type);

		await Promise.all(
			usageForType.map(({ owner }: { owner: { type: string; id?: string; stageId?: string; promptId?: string } }) =>
				dispatch(getDeleteAction(owner)),
			),
		);
	},
);

// Reducer helpers
const getStateWithUpdatedType = (
	state: CodebookState,
	entity: Entity,
	type: string | undefined,
	configuration: Partial<EntityType>,
): CodebookState => {
	if (entity !== "ego" && !type) {
		throw Error("Type must be specified for non ego nodes");
	}

	const entityConfiguration =
		entity === "ego"
			? configuration
			: {
					...state[entity],
					[type as string]: configuration,
				};

	return {
		...state,
		[entity]: entityConfiguration,
	};
};

const getStateWithUpdatedVariable = (
	state: CodebookState,
	entity: Entity,
	type: string | undefined,
	variable: string,
	configuration: Partial<Variable>,
	merge = false,
): CodebookState => {
	if (entity !== "ego" && !type) {
		throw Error("Type must be specified for non ego nodes");
	}

	const entityPath = entity === "ego" ? [entity] : [entity, type];

	const variableConfiguration = merge
		? {
				...((get(state, [...entityPath, "variables", variable]) as Partial<Variable> | undefined) ?? {}),
				...configuration,
			}
		: configuration;

	const newVariables = {
		...((get(state, [...entityPath, "variables"]) as Record<string, Variable> | undefined) ?? {}),
		[variable]: variableConfiguration,
	};

	const typeConfiguration = (get(state, entityPath) as Partial<EntityType> | undefined) ?? {};

	return getStateWithUpdatedType(state, entity, type, {
		...typeConfiguration,
		variables: newVariables,
	});
};

// Codebook slice
const codebookSlice = createSlice({
	name: "codebook",
	initialState,
	reducers: {
		createType: (state, action: PayloadAction<CreateTypePayload>) => {
			const { entity, type, configuration } = action.payload;
			return getStateWithUpdatedType(state, entity, type, configuration);
		},
		updateType: (state, action: PayloadAction<UpdateTypePayload>) => {
			const { entity, type, configuration } = action.payload;
			return getStateWithUpdatedType(state, entity, type, configuration);
		},
		deleteType: (state, action: PayloadAction<DeleteTypePayload>) => {
			const { entity, type } = action.payload;
			if (entity === "ego") {
				return state;
			}
			return {
				...state,
				[entity]: {
					...omit(state[entity], type),
				},
			} as CodebookState;
		},
		createVariable: (state, action: PayloadAction<CreateVariablePayload>) => {
			const { entity, type, variable, configuration } = action.payload;
			return getStateWithUpdatedVariable(state, entity, type, variable, configuration, false);
		},
		updateVariable: (state, action: PayloadAction<UpdateVariablePayload>) => {
			const { variable, configuration, merge = false } = action.payload;

			const variables = getAllVariableUUIDsByEntity(state as unknown as CodebookState);
			const variableInfo = find(variables, ["uuid", variable]);

			if (!variableInfo) {
				return state;
			}

			const { entity, entityType } = variableInfo;
			return getStateWithUpdatedVariable(state, entity, entityType ?? undefined, variable, configuration, merge);
		},
		deleteVariable: (state, action: PayloadAction<DeleteVariablePayload>) => {
			const { entity, type, variable } = action.payload;
			const variablePath = entity !== "ego" ? `${type}.variables.${variable}` : `variables.${variable}`;

			return {
				...state,
				[entity]: {
					...omit(state[entity], variablePath),
				},
			} as CodebookState;
		},
	},
});

// Export convenience wrapper for updateVariableAsync with cleaner API
export const updateVariableByUUID = (variable: string, properties: Partial<Variable>, merge = false) =>
	updateVariableAsync({ variable, configuration: properties, merge });

// Export for backwards compatibility and testing
export const test = {
	createType: (entity: Entity, type: string, configuration: Partial<EntityType>) =>
		codebookSlice.actions.createType({ entity, type, configuration: { ...defaultTypeTemplate, ...configuration } }),
	updateType: (entity: Entity, type: string, configuration: Partial<EntityType>) =>
		codebookSlice.actions.updateType({ entity, type, configuration }),
	deleteType: (entity: Entity, type: string) => codebookSlice.actions.deleteType({ entity, type }),
	createVariable: (entity: Entity, type: string | undefined, variable: string, configuration: Variable) =>
		codebookSlice.actions.createVariable({ entity, type, variable, configuration: prune(configuration) }),
	updateVariable: (variable: string, configuration: Partial<Variable>, merge = false) =>
		codebookSlice.actions.updateVariable({ variable, configuration: prune(configuration), merge }),
	deleteVariable: (entity: Entity, type: string | undefined, variable: string) =>
		codebookSlice.actions.deleteVariable({ entity, type, variable }),
};

// Note: Types Entity, Variable, EntityType, and CodebookState are only used internally

// Export the reducer as default
export default codebookSlice.reducer;
