import { createSelector, type Selector } from '@reduxjs/toolkit';
import { get } from 'es-toolkit/compat';

import type { Variable } from '@codaco/protocol-validation';

import { getAssetManifest, getCodebook } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import { getStageSubject } from './session';

// Get all variables for all subjects in the codebook, adding the entity and type
export const getAllVariableUUIDsByEntity = createSelector(
  getCodebook,
  (codebook) => {
    if (!codebook) {
      return {} as Record<
        string,
        Variable & {
          entity: 'node' | 'edge' | 'ego';
          entityType: string | null;
        }
      >;
    }

    const { node: nodeTypes, edge: edgeTypes, ego } = codebook;
    const variables = {} as Record<
      string,
      Variable & {
        entity: 'node' | 'edge' | 'ego';
        entityType: string | null;
      }
    >;

    // Nodes
    Object.entries(nodeTypes ?? {}).forEach(
      ([nodeTypeIndex, nodeTypeDefinition]) => {
        const nodeVariables = get(nodeTypeDefinition, 'variables', {});

        Object.entries(nodeVariables).forEach(([variableIndex, definition]) => {
          variables[variableIndex] = {
            entity: 'node',
            entityType: nodeTypeIndex,
            ...definition,
          };
        });
      },
    );

    // Edges
    Object.entries(edgeTypes ?? {}).forEach(
      ([edgeTypeIndex, edgeTypeDefinition]) => {
        const edgeVariables = get(edgeTypeDefinition, 'variables', {});
        Object.entries(edgeVariables).forEach(([variableIndex, definition]) => {
          variables[variableIndex] = {
            entity: 'edge',
            entityType: edgeTypeIndex,
            ...definition,
          };
        });
      },
    );

    // Ego
    const egoVariables = get(ego, 'variables', {});
    Object.entries(egoVariables ?? {}).forEach(
      ([variableIndex, definition]) => {
        variables[variableIndex] = {
          entity: 'ego',
          entityType: null,
          ...definition,
        };
      },
    );

    return variables;
  },
);

export const getCodebookVariablesForSubjectType: (
  state: RootState,
  currentStep: number,
) => Record<string, Variable> = createSelector(
  getCodebook,
  getStageSubject,
  (codebook, subject) => {
    if (!subject) {
      return {};
    }

    // TODO: make subject mandatory on data stages, and introduce ego subject type.
    if (subject.entity === 'ego') {
      return codebook.ego?.variables ?? {};
    }

    const { entity, type } = subject;

    return codebook[entity]?.[type]?.variables ?? {};
  },
);

/**
 * Version of getCodebookVariablesForSubjectType that accepts a variable ID and
 * returns the single variable definition
 */
// Explicit output annotation: the enlarged stage union makes the inferred
// selector type too long for TS to serialize (TS7056), so the exported const
// is typed as a plain Selector to keep the serialized type bounded.
export const makeGetCodebookVariableById: Selector<
  RootState,
  (variableId: string) => Variable | undefined
> = createSelector(
  getCodebookVariablesForSubjectType,
  (variables) =>
    (variableId: string): Variable | undefined =>
      variables[variableId],
);

export const makeGetCodebookForNodeType = createSelector(
  getCodebook,
  (codebook) => (type: string) => {
    return codebook.node?.[type];
  },
);

export const makeGetCodebookVariablesForNodeType = createSelector(
  getCodebook,
  (codebook) => (type: string) => {
    return codebook.node?.[type]?.variables ?? {};
  },
);

export const makeGetCodebookVariablesForEdgeType = createSelector(
  getCodebook,
  (codebook) => (type: string) => {
    return codebook.edge?.[type]?.variables ?? {};
  },
);

export const makeGetApiKeyAssetValue = createSelector(
  getAssetManifest,
  (manifest) => (key: string) => {
    const value = manifest[key]?.value;
    return value;
  },
);
