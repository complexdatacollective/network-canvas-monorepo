import { v4 as uuid } from "uuid";
import { describe, expect, it } from "vitest";
import reducer, { test } from "../assetManifest";

describe("protocol/assetManifest", () => {
	describe("reducer", () => {
		it("IMPORT_ASSET_COMPLETE correctly updates state", () => {
			const assetId = uuid();
			const result = reducer(
				{},
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
			expect(entries[0].id).toBeTruthy();
		});

		it("DELETE_ASSET correctly updates state", () => {
			const assetId = uuid();
			const state = {
				[assetId]: {
					id: assetId,
					name: "my-original-filename.jpg",
					source: "uuid-file-location-in-protocol",
					type: "image",
				},
			};
			const result = reducer(state, test.deleteAsset(assetId));
			expect(result).toEqual({});
		});
	});

	describe("actionCreators", () => {
		it.todo("importAsset() dispatches correct actions");
		it.todo("importAsset() dispatches correct actions when util/importAsset fails");
		it.todo("deleteAsset() dispatches correct actions");
	});
});
