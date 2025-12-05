import type {
	Codebook,
	CurrentProtocol,
	EdgeColor,
	EdgeDefinition,
	EntityDefinition,
	Variable,
} from "@codaco/protocol-validation";
import { createAsyncThunk, createSlice, current, type PayloadAction } from "@reduxjs/toolkit";
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

type Entity = "node" | "edge" | "ego";

type CreateTypePayload<T extends EntityDefinition = EntityDefinition> = {
	entity: Entity;
	type: string;
	configuration: Partial<T>;
};

type UpdateTypePayload = {
	entity: Entity;
	type: string;
	configuration: Partial<EntityDefinition>;
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
const initialState: Codebook = {
	edge: {},
	node: {},
};

const defaultTypeTemplate: Partial<EntityDefinition> = {
	variables: {},
};

// Async thunks
export const createTypeAsync = createAsyncThunk(
	"codebook/createTypeAsync",
	async ({ entity, configuration }: { entity: Entity; configuration: Partial<EntityDefinition> }, { dispatch }) => {
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
		{
			entity,
			type,
			configuration,
		}: {
			entity: Entity;
			type: string;
			configuration: Partial<EntityDefinition>;
		},
		{ dispatch },
	) => {
		const payload: UpdateTypePayload = { entity, type, configuration };
		dispatch(codebookSlice.actions.updateType(payload));
		return { type, entity };
	},
);

export const createEdgeAsync = createAsyncThunk(
	"codebook/createEdgeAsync",
	async (configuration: Partial<EdgeDefinition>, { dispatch, getState }) => {
		const entity: Entity = "edge";
		const state = getState() as RootState;
		const protocol = (state.activeProtocol?.present || state.activeProtocol) as CurrentProtocol;
		const colorFromHelper = getNextCategoryColor(protocol, entity);
		const color = configuration.color ?? colorFromHelper;
		const type = uuid();

		const payload: CreateTypePayload<EdgeDefinition> = {
			entity,
			type,
			configuration: { ...configuration },
		};

		if (color) {
			payload.configuration.color = color as EdgeColor;
		}

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
			usageForType.map(
				({
					owner,
				}: {
					owner: {
						type: string;
						id?: string;
						stageId?: string;
						promptId?: string;
					};
				}) => dispatch(getDeleteAction(owner)),
			),
		);
	},
);

// Reducer helpers
const getStateWithUpdatedType = (
	state: Codebook,
	entity: Entity,
	type: string | undefined,
	configuration: Partial<EntityDefinition>,
): Codebook => {
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
	state: Codebook,
	entity: Entity,
	type: string | undefined,
	variable: string,
	configuration: Partial<Variable>,
	merge = false,
): Codebook => {
	if (entity !== "ego" && !type) {
		throw Error("Type must be specified for non ego nodes");
	}

	const entityPath = entity === "ego" ? [entity] : [entity, type as string];

	const existingVariable = get(state, [...entityPath, "variables", variable]);
	const variableConfiguration: Variable = merge
		? ({
				...(existingVariable && typeof existingVariable === "object" ? (existingVariable as Partial<Variable>) : {}),
				...configuration,
			} as Variable)
		: (configuration as Variable);

	const existingVariables = get(state, [...entityPath, "variables"]);
	const newVariables: Record<string, Variable> = {
		...(existingVariables && typeof existingVariables === "object"
			? (existingVariables as Record<string, Variable>)
			: {}),
		[variable]: variableConfiguration,
	};

	const existingTypeConfig = get(state, entityPath);
	const typeConfiguration =
		existingTypeConfig && typeof existingTypeConfig === "object"
			? (existingTypeConfig as Partial<EntityDefinition>)
			: {};

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
			};
		},
		createVariable: (state, action: PayloadAction<CreateVariablePayload>) => {
			const { entity, type, variable, configuration } = action.payload;
			return getStateWithUpdatedVariable(state, entity, type, variable, configuration, false);
		},
		updateVariable: (state, action: PayloadAction<UpdateVariablePayload>) => {
			const { variable, configuration, merge = false } = action.payload;

			// Use current() to get a non-draft version of state for the selector
			const currentState = current(state);
			const variables = getAllVariableUUIDsByEntity(currentState);
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
			};
		},
	},
});

// Export convenience wrapper for updateVariableAsync with cleaner API
export const updateVariableByUUID = (variable: string, properties: Partial<Variable>, merge = false) =>
	updateVariableAsync({ variable, configuration: properties, merge });

// Export the reducer as default
export default codebookSlice.reducer;
