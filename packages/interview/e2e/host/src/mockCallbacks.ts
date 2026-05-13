import type { AssetRequestHandler, FinishHandler, SyncHandler } from "../../../src/contract/types";

// The Shell is a self-contained Redux island in the e2e host. There is no
// remote sink for sessions — Playwright reads state straight from the live
// Redux store via window.__interviewStore. So sync is a no-op.
export const mockSync: SyncHandler = async (): Promise<void> => {};

export const mockFinish: FinishHandler = async (_interviewId: string, _signal: AbortSignal): Promise<void> => {
	// No-op finish handler for e2e tests.
};

export function makeMockAssetRequest(assetUrls: Map<string, string>): AssetRequestHandler {
	return async (assetId: string): Promise<string> => {
		const url = assetUrls.get(assetId);
		if (!url) throw new Error(`No URL registered for asset ${assetId}`);
		return url;
	};
}
