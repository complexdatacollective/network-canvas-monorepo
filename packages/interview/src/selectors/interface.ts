import { createSelector } from '@reduxjs/toolkit';

import type { Variable } from '@codaco/protocol-validation';

import { getCodebook } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import { getSubjectType } from './session';

export const getNodeVariables: (
  state: RootState,
  currentStep: number,
) => Record<string, Variable> = createSelector(
  getCodebook,
  getSubjectType,
  (codebook, nodeType) => {
    const nodeInfo = codebook.node;

    return nodeType ? (nodeInfo?.[nodeType]?.variables ?? {}) : {};
  },
);
