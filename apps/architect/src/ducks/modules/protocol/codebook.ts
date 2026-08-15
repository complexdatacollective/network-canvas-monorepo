import { createSlice, current, type PayloadAction } from '@reduxjs/toolkit';
import { find, get, has, isEmpty, omit } from 'es-toolkit/compat';
import { v4 as uuid } from 'uuid';

import type {
  Codebook,
  EdgeColor,
  EdgeDefinition,
  EntityDefinition,
  Variable,
  VariablePropertyKey,
} from '@codaco/protocol-validation';
import { createAppAsyncThunk } from '~/ducks/createAppAsyncThunk';
import type { RootState } from '~/ducks/store';
import {
  getAllVariableUUIDsByEntity,
  getVariablesForSubject,
} from '~/selectors/codebook';
import { getIsUsed } from '~/selectors/codebook/isUsed';
import { getProtocol } from '~/selectors/protocol';
import { getStageEditorCodebookTransactionOpen } from '~/selectors/stageEditorDraft';
import prune from '~/utils/prune';
import safeName from '~/utils/safeName';

import { commitStageEditorDraft } from './commitStageEditorDraft';
import { deleteStage } from './deleteStage';
import { stageEditorCodebookMeta } from './stageEditorCodebookMeta';
import { getNextCategoryColor } from './utils/helpers';

type Entity = 'node' | 'edge' | 'ego';

/**
 * Stamps a codebook slice action for the stage editor's draft copy whenever a
 * codebook transaction is open, so nothing a nested field or variable editor
 * writes reaches the canonical protocol before the stage is committed (#1382).
 *
 * Routing here rather than at each of the ~11 UI call sites keeps the decision
 * in one place, and means a new call site is transactional by default rather
 * than by remembering to opt in.
 */
const routeCodebookAction = <T extends { type: string }>(
  action: T,
  state: RootState,
): T =>
  getStageEditorCodebookTransactionOpen(state)
    ? { ...action, meta: stageEditorCodebookMeta }
    : action;

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
  replaceProperties?: readonly VariablePropertyKey[];
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
export const createTypeAsync = createAppAsyncThunk(
  'codebook/createTypeAsync',
  async (
    {
      entity,
      configuration,
    }: { entity: Entity; configuration: Partial<EntityDefinition> },
    { dispatch, getState },
  ) => {
    const type = uuid();
    const payload: CreateTypePayload = {
      entity,
      type,
      configuration: {
        ...defaultTypeTemplate,
        ...configuration,
      },
    };

    dispatch(
      routeCodebookAction(
        codebookSlice.actions.createType(payload),
        getState(),
      ),
    );
    return { type, entity };
  },
);

export const updateTypeAsync = createAppAsyncThunk(
  'codebook/updateTypeAsync',
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
    { dispatch, getState },
  ) => {
    const payload: UpdateTypePayload = { entity, type, configuration };
    dispatch(
      routeCodebookAction(
        codebookSlice.actions.updateType(payload),
        getState(),
      ),
    );
    return { type, entity };
  },
);

export const createEdgeAsync = createAppAsyncThunk(
  'codebook/createEdgeAsync',
  async (configuration: Partial<EdgeDefinition>, { dispatch, getState }) => {
    const entity: Entity = 'edge';
    const state = getState();
    // Draft-aware, so a colour picked inside an open stage editor accounts for
    // edge types created earlier in the same (uncommitted) session.
    const protocol = getProtocol(state);
    const colorFromHelper = protocol
      ? getNextCategoryColor(protocol, entity)
      : undefined;
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

    dispatch(
      routeCodebookAction(codebookSlice.actions.createType(payload), state),
    );
    return { type, entity };
  },
);

export const createVariableAsync = createAppAsyncThunk(
  'codebook/createVariableAsync',
  async (
    {
      entity,
      type,
      configuration,
    }: { entity: Entity; type?: string; configuration: Partial<Variable> },
    { dispatch, getState },
  ) => {
    if (!configuration.name) {
      throw new Error('Cannot create a new variable without a name');
    }

    if (!configuration.type) {
      throw new Error('Cannot create a new variable without a type');
    }

    const safeConfiguration = prune({
      ...configuration,
      name: safeName(configuration.name),
    }) as Variable;

    if (isEmpty(safeConfiguration.name)) {
      throw new Error('Variable name contains no valid characters');
    }

    const state = getState();
    const variables = getVariablesForSubject(state, { entity, type });
    const variableNameExists = Object.values(variables).some(
      ({ name }) => name === safeConfiguration.name,
    );

    // We can't use same variable name twice.
    if (variableNameExists) {
      throw new Error(
        `Variable with name "${safeConfiguration.name}" already exists`,
      );
    }

    const variable = uuid();
    const payload: CreateVariablePayload = {
      entity,
      type,
      variable,
      configuration: safeConfiguration,
    };

    dispatch(
      routeCodebookAction(codebookSlice.actions.createVariable(payload), state),
    );
    return { entity, type, variable };
  },
);

export const updateVariableAsync = createAppAsyncThunk(
  'codebook/updateVariableAsync',
  async (
    {
      entity,
      type,
      variable,
      configuration,
      replaceProperties = [],
    }: {
      entity?: Entity;
      type?: string;
      variable: string;
      configuration: Partial<Variable>;
      replaceProperties?: readonly VariablePropertyKey[];
    },
    { dispatch, getState },
  ) => {
    if (!variable) {
      throw new Error('No variable provided to updateVariable()!');
    }

    const state = getState();

    // If entity and type are provided, validate the variable exists
    if (entity && type) {
      const variableExists = has(
        getVariablesForSubject(state, { entity, type }),
        variable,
      );

      if (!variableExists) {
        throw new Error(`Variable "${variable}" does not exist`);
      }
    }

    const payload: UpdateVariablePayload = {
      variable,
      configuration: prune(configuration),
      replaceProperties,
    };

    dispatch(
      routeCodebookAction(codebookSlice.actions.updateVariable(payload), state),
    );
    return payload;
  },
);

export const deleteVariableAsync = createAppAsyncThunk(
  'codebook/deleteVariableAsync',
  async (
    {
      entity,
      type,
      variable,
    }: { entity: Entity; type?: string; variable: string },
    { dispatch, getState },
  ) => {
    const state = getState();
    const isUsed = getIsUsed(state);

    // REJECT rather than resolve `false`. A resolved thunk reads as success to
    // every caller — `useDialog().confirm` closes its dialog and reports done —
    // so the researcher was told a variable had been deleted while it was still
    // there (#1392). The message is researcher-facing: it is rendered verbatim
    // in the confirm dialog's error paragraph.
    if (get(isUsed, variable, false)) {
      throw new Error(
        'This variable is in use and cannot be deleted. Remove it from the stages listed under "Used In" first.',
      );
    }

    const payload: DeleteVariablePayload = { entity, type, variable };
    dispatch(
      routeCodebookAction(codebookSlice.actions.deleteVariable(payload), state),
    );
  },
);

export const deleteTypeAsync = createAppAsyncThunk(
  'codebook/deleteTypeAsync',
  async (
    { entity, type }: { entity: Entity; type: string },
    { dispatch, getState },
  ) => {
    const payload: DeleteTypePayload = { entity, type };
    dispatch(
      routeCodebookAction(
        codebookSlice.actions.deleteType(payload),
        getState(),
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
  if (entity !== 'ego' && !type) {
    throw Error('Type must be specified for non ego nodes');
  }

  const entityConfiguration =
    entity === 'ego'
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
  replaceProperties: readonly VariablePropertyKey[] = [],
): Codebook => {
  if (entity !== 'ego' && !type) {
    throw Error('Type must be specified for non ego nodes');
  }

  const entityPath = entity === 'ego' ? [entity] : [entity, type as string];

  const existingVariable = get(state, [...entityPath, 'variables', variable]);
  const preservedProperties =
    existingVariable && typeof existingVariable === 'object'
      ? omit(existingVariable as Partial<Variable>, replaceProperties)
      : {};
  const variableConfiguration = {
    ...preservedProperties,
    ...configuration,
  } as Variable;

  const existingVariables = get(state, [...entityPath, 'variables']);
  const newVariables: Record<string, Variable> = {
    ...(existingVariables && typeof existingVariables === 'object'
      ? (existingVariables as Record<string, Variable>)
      : {}),
    [variable]: variableConfiguration,
  };

  const existingTypeConfig = get(state, entityPath);
  const typeConfiguration =
    existingTypeConfig && typeof existingTypeConfig === 'object'
      ? (existingTypeConfig as Partial<EntityDefinition>)
      : {};

  return getStateWithUpdatedType(state, entity, type, {
    ...typeConfiguration,
    variables: newVariables,
  });
};

// Codebook slice
const codebookSlice = createSlice({
  name: 'codebook',
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
      if (entity === 'ego') {
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
      return getStateWithUpdatedVariable(
        state,
        entity,
        type,
        variable,
        configuration,
      );
    },
    updateVariable: (state, action: PayloadAction<UpdateVariablePayload>) => {
      const {
        variable,
        configuration,
        replaceProperties = [],
      } = action.payload;

      // Use current() to get a non-draft version of state for the selector
      const currentState = current(state);
      const variables = getAllVariableUUIDsByEntity(currentState);
      const variableInfo = find(variables, ['uuid', variable]);

      if (!variableInfo) {
        return state;
      }

      const { entity, entityType } = variableInfo;
      return getStateWithUpdatedVariable(
        state,
        entity,
        entityType ?? undefined,
        variable,
        configuration,
        replaceProperties,
      );
    },
    deleteVariable: (state, action: PayloadAction<DeleteVariablePayload>) => {
      const { entity, type, variable } = action.payload;
      const variablePath =
        entity !== 'ego'
          ? `${type}.variables.${variable}`
          : `variables.${variable}`;

      return {
        ...state,
        [entity]: {
          ...omit(state[entity], variablePath),
        },
      };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(deleteStage, (state, action) => {
        if (!action.payload.clearEncryptedVariables) return;

        for (const nodeType of Object.values(state.node ?? {})) {
          for (const variable of Object.values(nodeType.variables ?? {})) {
            delete variable.encrypted;
          }
        }
      })
      // Promoting the stage editor's draft codebook. Replacing wholesale is
      // what makes discard total: a variable the editor created exists only in
      // the draft, and every property it changed (name, component, options,
      // parameters, validation) is carried by the same object — so there is no
      // per-property merge to get wrong in either direction.
      .addCase(
        commitStageEditorDraft,
        (state, action) => action.payload.codebook ?? state,
      );
  },
});

// Export convenience wrapper for updateVariableAsync with cleaner API
export const updateVariableByUUID = (
  variable: string,
  properties: Partial<Variable>,
  replaceProperties: readonly VariablePropertyKey[] = [],
) =>
  updateVariableAsync({
    variable,
    configuration: properties,
    replaceProperties,
  });

export const test = {
  updateVariable: (payload: UpdateVariablePayload) =>
    codebookSlice.actions.updateVariable(payload),
};

// Export the reducer as default
export default codebookSlice.reducer;
