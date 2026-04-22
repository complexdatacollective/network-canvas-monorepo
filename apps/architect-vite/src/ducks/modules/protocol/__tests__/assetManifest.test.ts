import { configureStore } from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import dialogsReducer from "~/ducks/modules/dialogs";
import reducer, { importAssetAsync, test } from "../assetManifest";

vi.mock("~/utils/protocols/assetTools", () => ({
	validateAsset: vi.fn(),
}));

vi.mock("~/utils/protocols/importAsset", () => ({
	getSupportedAssetType: vi.fn(() => "network"),
}));

vi.mock("~/utils/assetUtils", () => ({
	saveAssetToDb: vi.fn(() => Promise.resolve()),
}));

const { validateAsset } = await import("~/utils/protocols/assetTools");
const mockedValidateAsset = vi.mocked(validateAsset);

const createTestStore = () =>
	configureStore({
		reducer: {
			assetManifest: reducer,
			dialogs: dialogsReducer,
		},
		middleware: (getDefaultMiddleware) =>
			getDefaultMiddleware({
				serializableCheck: false,
			}),
	});

describe("protocol/assetManifest", () => {
	describe("reducer", () => {
		it("IMPORT_ASSET_COMPLETE correctly updates state", () => {
			const assetId = uuid();
			const result = reducer(
				undefined,
				test.importAssetComplete("uuid-file-location-in-protocol", "my-original-filename.jpg", "image", assetId),
			);

			// Should have one entry
			const entries = Object.values(result);
			expect(entries).toHaveLength(1);

			// Entry should have correct properties
			expect(entries[0]).toMatchObject({
				name: "my-original-filename.jpg",
				source: "uuid-file-location-in-protocol",
				type: "image",
			});
			expect(entries[0]?.id).toBeTruthy();
		});

		it("DELETE_ASSET correctly updates state", () => {
			const assetId = uuid();
			const state = {
				[assetId]: {
					id: assetId,
					name: "my-original-filename.jpg",
					source: "uuid-file-location-in-protocol",
					type: "image" as const,
				},
			};
			const result = reducer(state, test.deleteAsset(assetId));
			expect(result).toEqual({});
		});
	});

	describe("importAssetAsync", () => {
		let store: ReturnType<typeof createTestStore>;

		beforeEach(() => {
			store = createTestStore();
			vi.clearAllMocks();
		});

		it("dispatches duplicate rows warning dialog when duplicateCount > 0", async () => {
			mockedValidateAsset.mockResolvedValue({ duplicateCount: 3 });

			const file = new File(["test"], "roster.csv", { type: "text/csv" });
			await store.dispatch(importAssetAsync(file));

			const dialogs = store.getState().dialogs.dialogs;
			expect(dialogs).toHaveLength(1);
			expect(dialogs[0]).toMatchObject({
				type: "Warning",
				title: "Warning: roster.csv contains duplicate rows",
			});
		});

		it("does not dispatch duplicate rows warning dialog when duplicateCount is 0", async () => {
			mockedValidateAsset.mockResolvedValue({ duplicateCount: 0 });

			const file = new File(["test"], "roster.csv", { type: "text/csv" });
			await store.dispatch(importAssetAsync(file));

			const dialogs = store.getState().dialogs.dialogs;
			expect(dialogs).toHaveLength(0);
		});
	});

	describe("actionCreators", () => {
		it.todo("importAsset() dispatches correct actions");
		it.todo("importAsset() dispatches correct actions when util/importAsset fails");
		it.todo("deleteAsset() dispatches correct actions");
	});
});
