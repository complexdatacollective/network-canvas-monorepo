// Public API for @codaco/interview.
// This is the only re-export file in the package. All internal modules
// import from each other directly.

export { isValidAssetType } from "./contract/assets";
// Public types
export type {
	AssetRequestHandler,
	ErrorHandler,
	FinishHandler,
	InterviewerFlags,
	InterviewPayload,
	ProtocolPayload,
	ResolvedAsset,
	SessionPayload,
	StepChangeHandler,
	SyncHandler,
} from "./contract/types";
// Runtime
export { default as Shell } from "./Shell";

// Schemas / contracts
export { createInitialNetwork, StageMetadataSchema } from "./session-schemas";
export type { GenerateNetworkOptions, GenerateNetworkResult } from "./synthetic/generateNetwork";

// Synthetic
export { generateNetwork } from "./synthetic/generateNetwork";
export { InterviewToastViewport } from "./toast/InterviewToast";
export { interviewToastManager } from "./toast/interviewToastManager";
// Public utilities (consumed by sibling monorepo packages, e.g. network-exporters)
export { getNodeLabelAttribute } from "./utils/getNodeLabelAttribute";
