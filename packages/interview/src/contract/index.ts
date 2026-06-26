// Server-safe contract surface for @codaco/interview.
//
// Everything re-exported here is React-free, so this entry point can be
// imported from server (React Server Component) code without evaluating the
// package's component graph — importing the main entry pulls in `Shell` and
// its module-level `createContext` calls, which throw in an RSC build.
//
// Runtime exports must come from React-free modules only (no `Shell`, no
// `contexts`). Types are erased at compile time and are safe to re-export.

export { isValidAssetType } from './assets';
export { createInitialNetwork } from './network';

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
} from './types';
