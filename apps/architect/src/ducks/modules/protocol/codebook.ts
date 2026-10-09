import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
const errorMessages = defineMessages({
  missingName: {
    id: 'architect.codebook.error.missingName',
    defaultMessage: 'Enter a name for this attribute.',
    description:
      'Actionable codebook write or deletion refusal. Any name or id is preserved authored data.',
  },
  missingType: {
    id: 'architect.codebook.error.missingType',
    defaultMessage: 'Choose a type for this attribute.',
    description:
      'Actionable codebook write or deletion refusal. Any name or id is preserved authored data.',
  },
  invalidName: {
    id: 'architect.codebook.error.invalidName',
    defaultMessage:
      'An attribute name can’t contain tabs, line breaks or other control characters.',
    description:
      'Actionable codebook write refusal for an attribute name that contains an invisible control character. Any script, spaces and punctuation are allowed in an attribute name.',
  },
  duplicateName: {
    id: 'architect.codebook.error.duplicateName',
    defaultMessage: 'Attribute with name "{name}" already exists',
    description:
      'Actionable codebook write or deletion refusal. Any name or id is preserved authored data.',
  },
  missingAttribute: {
    id: 'architect.codebook.error.missingAttribute',
    defaultMessage: 'Attribute "{id}" does not exist',
    description:
      'Actionable codebook write or deletion refusal. Any name or id is preserved authored data.',
  },
  attributeInUse: {
    id: 'architect.codebook.error.attributeInUse',
    defaultMessage:
      'This attribute is in use and cannot be deleted. Remove it from the stages listed under "Used In" first.',
    description:
      'Actionable codebook write or deletion refusal. Any name or id is preserved authored data.',
  },
  typeInUse: {
    id: 'architect.codebook.error.typeInUse',
    defaultMessage:
      'This type is in use and cannot be deleted. Remove it from the stages listed under "used in" first.',
    description:
      'Actionable codebook write or deletion refusal. Any name or id is preserved authored data.',
  },
});
import { createSlice, current, type PayloadAction } from '@reduxjs/toolkit';
import { find, get, has, omit } from 'es-toolkit/compat';
import { v4 as uuid } from 'uuid';

import {
  type Codebook,
  type EdgeColor,
  type EdgeDefinition,
  type EntityDefinition,
  escapeMessageText,
  type Variable,
  type VariablePropertyKey,
} from '@codaco/protocol-validation';
import {
  CodebookNameSchema,
  normalizeCodebookName,
  normalizeForComparison,
} from '@codaco/shared-consts';
import { createAppAsyncThunk } from '~/ducks/createAppAsyncThunk';
import type { RootState } from '~/ducks/store';
import {
  getAllVariableUUIDsByEntity,
  getVariablesForSubject,
} from '~/selectors/codebook';
import { getIsUsed } from '~/selectors/codebook/isUsed';
import { getEdgeIndex, getNodeIndex, utils } from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';
import prune from '~/utils/prune';

import { deleteStage } from './deleteStage';
import { getNextCategoryColor } from './utils/helpers';

type Entity = 'node' | 'edge' | 'ego';

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

// Names are saved normalized (`normalizeCodebookName`), whatever the editor
// that wrote them let through.
const normalizedName = (name: unknown) =>
  typeof name === 'string' ? { name: normalizeCodebookName(name) } : {};

// Participants see a type's label, not its name. A new type starts with its
// name as the label in the protocol's default language; a label the caller
// supplies replaces it.
const labelFromName = (state: RootState, name: string | undefined) => {
  const localization = getProtocol(state)?.localization;
  return name && localization
    ? { label: { [localization.defaultLocale]: escapeMessageText(name) } }
    : {};
};

// Only categorical and ordinal options carry text a researcher typed; a boolean
// variable's options are true and false. It runs on the variable as stored,
// because an edit sends only what changed and so may not say the type.
const withNormalizedOptionValues = (variable: Variable): Variable => {
  if (
    (variable.type !== 'categorical' && variable.type !== 'ordinal') ||
    !Array.isArray(variable.options)
  ) {
    return variable;
  }
  return {
    ...variable,
    options: variable.options.map((option) =>
      typeof option.value === 'string'
        ? { ...option, value: normalizeCodebookName(option.value) }
        : option,
    ),
  };
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
    const name = normalizedName(get(configuration, 'name'));
    const payload: CreateTypePayload = {
      entity,
      type,
      configuration: {
        ...defaultTypeTemplate,
        // The ego has no label: the participant is never shown a type name.
        ...(entity === 'ego' ? {} : labelFromName(getState(), name.name)),
        ...configuration,
        ...name,
      },
    };

    dispatch(codebookSlice.actions.createType(payload));
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
    { dispatch },
  ) => {
    const payload: UpdateTypePayload = {
      entity,
      type,
      configuration: {
        ...configuration,
        ...normalizedName(get(configuration, 'name')),
      },
    };
    dispatch(codebookSlice.actions.updateType(payload));
    return { type, entity };
  },
);

export const createEdgeAsync = createAppAsyncThunk(
  'codebook/createEdgeAsync',
  async (configuration: Partial<EdgeDefinition>, { dispatch, getState }) => {
    const entity: Entity = 'edge';
    const state = getState();
    const protocol = getProtocol(state);
    const colorFromHelper = protocol
      ? getNextCategoryColor(protocol, entity)
      : undefined;
    const color = configuration.color ?? colorFromHelper;
    const type = uuid();
    const name = normalizedName(configuration.name);

    const payload: CreateTypePayload<EdgeDefinition> = {
      entity,
      type,
      configuration: {
        ...labelFromName(state, name.name),
        ...configuration,
        ...name,
      },
    };

    if (color) {
      payload.configuration.color = color as EdgeColor;
    }

    dispatch(codebookSlice.actions.createType(payload));
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
    const name = normalizeCodebookName(configuration.name ?? '');

    if (name === '') {
      throw new Error(createMessageError(errorMessages.missingName));
    }

    if (!configuration.type) {
      throw new Error(createMessageError(errorMessages.missingType));
    }

    if (!CodebookNameSchema.safeParse(name).success) {
      throw new Error(createMessageError(errorMessages.invalidName));
    }

    const state = getState();
    // An attribute's label is not translated, so it starts as the name itself.
    const safeConfiguration = prune({
      label: name,
      ...configuration,
      name,
    }) as Variable;

    const variables = getVariablesForSubject(state, { entity, type });
    const variableNameExists = Object.values(variables).some(
      (existing) =>
        normalizeForComparison(existing.name) === normalizeForComparison(name),
    );

    // We can't use same variable name twice.
    if (variableNameExists) {
      throw new Error(
        createMessageError(errorMessages.duplicateName, { name }),
      );
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

const updateVariableAsync = createAppAsyncThunk(
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
      throw new Error(
        createMessageError(errorMessages.missingAttribute, { id: variable }),
      );
    }

    const state = getState();

    // If entity and type are provided, validate the variable exists
    if (entity && type) {
      const variableExists = has(
        getVariablesForSubject(state, { entity, type }),
        variable,
      );

      if (!variableExists) {
        throw new Error(
          createMessageError(errorMessages.missingAttribute, { id: variable }),
        );
      }
    }

    const payload: UpdateVariablePayload = {
      variable,
      configuration: prune({
        ...configuration,
        ...normalizedName(get(configuration, 'name')),
      }),
      replaceProperties,
    };

    dispatch(codebookSlice.actions.updateVariable(payload));
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
      throw new Error(createMessageError(errorMessages.attributeInUse));
    }

    const payload: DeleteVariablePayload = { entity, type, variable };
    dispatch(codebookSlice.actions.deleteVariable(payload));
  },
);

/**
 * Whether the protocol references this entity type anywhere — the same indexes
 * the Codebook's "used in" tags are built from (`makeGetEntityWithUsage`), read
 * again here at the moment of the write.
 *
 * Asked twice on purpose: a row's `inUse` prop is a render-time snapshot, so a
 * Delete control can be live while the store has already moved on (the same
 * gap #1392 was filed for on variables). `ego` has no types to delete.
 */
const getEntityTypeIsUsed = (
  state: RootState,
  entity: Entity,
  type: string,
): boolean => {
  if (entity === 'ego') return false;
  const typeIndex =
    entity === 'node' ? getNodeIndex(state) : getEdgeIndex(state);
  return utils.buildSearch([typeIndex]).has(type);
};

export const deleteTypeAsync = createAppAsyncThunk(
  'codebook/deleteTypeAsync',
  async (
    { entity, type }: { entity: Entity; type: string },
    { dispatch, getState },
  ) => {
    const state = getState();

    // REJECT rather than resolve, exactly as `deleteVariableAsync` does and for
    // the same reason: a resolved thunk reads as success to every caller —
    // `useDialog().confirm` closes its dialog and reports done — so the
    // researcher was told a type had been deleted while it was still there
    // (#1392, which fixed the variable path and left this one). The message is
    // researcher-facing: it is rendered verbatim in the confirm dialog's error
    // paragraph.
    if (getEntityTypeIsUsed(state, entity, type)) {
      throw new Error(createMessageError(errorMessages.typeInUse));
    }

    const payload: DeleteTypePayload = { entity, type };
    dispatch(codebookSlice.actions.deleteType(payload));
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
  const variableConfiguration = withNormalizedOptionValues({
    ...preservedProperties,
    ...configuration,
  } as Variable);

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
    builder.addCase(deleteStage, (state, action) => {
      if (!action.payload.clearEncryptedVariables) return;

      for (const nodeType of Object.values(state.node ?? {})) {
        for (const variable of Object.values(nodeType.variables ?? {})) {
          delete variable.encrypted;
        }
      }
    });
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
