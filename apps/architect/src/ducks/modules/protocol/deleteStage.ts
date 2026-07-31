import { createAction } from '@reduxjs/toolkit';

export type DeleteStagePayload = {
  stageId: string;
  clearEncryptedVariables: boolean;
};

// Stage deletion and its protocol-wide cleanup are one user operation. Both
// the stages and codebook reducers handle this action so timeline, validation,
// and persistence observe only the completed protocol snapshot.
export const deleteStage =
  createAction<DeleteStagePayload>('stages/deleteStage');
