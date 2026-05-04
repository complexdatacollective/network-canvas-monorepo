// Public API for @codaco/interview.
// This is the only re-export file in the package. All internal modules
// import from each other directly.

// Runtime
export { default as Shell } from "./Shell";
export { InterviewToastViewport } from "./toast/InterviewToast";
export { interviewToastManager } from "./toast/interviewToastManager";

// Schemas / contracts
export { StageMetadataSchema, createInitialNetwork } from "./session-schemas";
export { isValidAssetType } from "./contract/assets";

// Synthetic
export { generateNetwork } from "./synthetic/generateNetwork";

// Public utilities (consumed by sibling monorepo packages, e.g. network-exporters)
export { getNodeLabelAttribute } from "./utils/getNodeLabelAttribute";

// Public types
export type {
	InterviewPayload,
	SessionPayload,
	ProtocolPayload,
	ResolvedAsset,
	SyncHandler,
	FinishHandler,
	AssetRequestHandler,
	ErrorHandler,
	StepChangeHandler,
	InterviewerFlags,
} from "./contract/types";

export type { GenerateNetworkOptions, GenerateNetworkResult } from "./synthetic/generateNetwork";
