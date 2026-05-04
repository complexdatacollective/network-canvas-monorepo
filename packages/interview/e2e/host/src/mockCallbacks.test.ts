import { describe, expect, it } from "vitest";
import type { SessionPayload } from "../../../src/contract/types";
import { createInitialNetwork } from "../../../src/store/modules/session";
import { createInterviewStateStore, makeMockAssetRequest, makeMockSync, mockFinish } from "./mockCallbacks";

function makeSession(overrides?: Partial<SessionPayload>): SessionPayload {
	return {
		id: "session-1",
		startTime: new Date().toISOString(),
		finishTime: null,
		exportTime: null,
		lastUpdated: new Date().toISOString(),
		network: createInitialNetwork(),
		currentStep: 0,
		...overrides,
	};
}

describe("createInterviewStateStore", () => {
	it("starts empty", () => {
		const store = createInterviewStateStore();
		expect(store.size).toBe(0);
	});

	it("is a Map", () => {
		const store = createInterviewStateStore();
		expect(store).toBeInstanceOf(Map);
	});
});

describe("makeMockSync", () => {
	it("stores the session in the provided store", async () => {
		const store = createInterviewStateStore();
		const sync = makeMockSync(store);
		const session = makeSession({ currentStep: 3 });

		await sync("interview-1", session);

		expect(store.get("interview-1")).toEqual(session);
	});

	it("overwrites an existing entry", async () => {
		const store = createInterviewStateStore();
		const sync = makeMockSync(store);

		const first = makeSession({ currentStep: 1 });
		const second = makeSession({ currentStep: 2 });

		await sync("interview-1", first);
		await sync("interview-1", second);

		expect(store.get("interview-1")?.currentStep).toBe(2);
	});

	it("handles multiple distinct interviews", async () => {
		const store = createInterviewStateStore();
		const sync = makeMockSync(store);

		await sync("a", makeSession({ currentStep: 0 }));
		await sync("b", makeSession({ currentStep: 5 }));

		expect(store.get("a")?.currentStep).toBe(0);
		expect(store.get("b")?.currentStep).toBe(5);
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
