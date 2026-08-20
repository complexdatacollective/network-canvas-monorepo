// Public API for @codaco/interview.
// This is the only re-export file in the package. All internal modules
// import from each other directly.

export { useTrack } from './analytics/useTrack';
export { isValidAssetType } from './contract/assets';
export { default as useOnline } from './hooks/useOnline';
// Public types
export type {
  AssetRequestHandler,
  FinishHandler,
  InterviewAnalyticsMetadata,
  InterviewerFlags,
  InterviewPayload,
  ProtocolPayload,
  ResolvedAsset,
  SessionPayload,
  StepChangeHandler,
  StepChangeMeta,
  SyncHandler,
} from './contract/types';
// Runtime
export { default as Shell, type NavigationOrientation } from './Shell';
export {
  default as ProtocolField,
  type ProtocolFieldDefinition,
} from './forms/ProtocolField';

export { createInitialNetwork } from './contract/network';
// Public utilities (consumed by the host apps — Interviewer, Architect, Fresco)
export { getLastAvailableAuthoredStageIndex } from './selectors/skip-logic';
export { getInterviewProgress } from './selectors/utils';
export { getNodeLabelAttribute } from './utils/getNodeLabelAttribute';
