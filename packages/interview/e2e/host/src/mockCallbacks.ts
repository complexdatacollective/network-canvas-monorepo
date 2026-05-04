import type { AssetRequestHandler, FinishHandler, SessionPayload, SyncHandler } from "../../../src/contract/types";

export type InterviewStateStore = Map<string, SessionPayload>;

export function createInterviewStateStore(): InterviewStateStore {
	return new Map<string, SessionPayload>();
}

export function makeMockSync(store: InterviewStateStore): SyncHandler {
	return async (interviewId: string, session: SessionPayload): Promise<void> => {
		store.set(interviewId, session);
	};
}

export const mockFinish: FinishHandler = async (_interviewId: string, _signal: AbortSignal): Promise<void> => {
	// No-op finish handler for e2e tests.
};

export function makeMockAssetRequest(assetUrls: Map<string, string>): AssetRequestHandler {
	return async (assetId: string): Promise<string> => {
		return assetUrls.get(assetId) ?? "";
	};
}
