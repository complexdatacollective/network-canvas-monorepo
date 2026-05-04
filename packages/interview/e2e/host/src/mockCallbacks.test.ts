import { describe, expect, it } from "vitest";
import type { SessionPayload } from "../../../src/contract/types";
import { createInitialNetwork } from "../../../src/store/modules/session";
import { makeMockAssetRequest, mockFinish, mockSync } from "./mockCallbacks";

function makeSession(): SessionPayload {
	return {
		id: "session-1",
		startTime: new Date().toISOString(),
		finishTime: null,
		exportTime: null,
		lastUpdated: new Date().toISOString(),
		network: createInitialNetwork(),
		currentStep: 0,
	};
}

describe("mockSync", () => {
	it("is a no-op (Shell owns state in Redux; tests read it via window.__interviewStore)", async () => {
		await expect(mockSync("interview-1", makeSession())).resolves.toBeUndefined();
	});
});

describe("mockFinish", () => {
	it("resolves without error", async () => {
		const controller = new AbortController();
		await expect(mockFinish("interview-1", controller.signal)).resolves.toBeUndefined();
	});
});

describe("makeMockAssetRequest", () => {
	it("resolves the URL for a known assetId", async () => {
		const assetUrls = new Map([["asset-abc", "https://example.com/image.png"]]);
		const handler = makeMockAssetRequest(assetUrls);

		await expect(handler("asset-abc")).resolves.toBe("https://example.com/image.png");
	});

	it("throws for an unknown assetId", async () => {
		const assetUrls = new Map<string, string>();
		const handler = makeMockAssetRequest(assetUrls);

		await expect(handler("unknown")).rejects.toThrow(/No URL registered/);
	});
});
