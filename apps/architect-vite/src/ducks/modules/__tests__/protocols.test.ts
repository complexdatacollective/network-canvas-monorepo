import { describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import protocolsReducer, {
	addProtocol,
	updateProtocol,
	updateProtocolMetadata,
	removeProtocol,
	selectAllProtocols,
	selectProtocolById,
	selectRecentProtocols,
	selectProtocolExists,
	generateProtocolId,
} from "../protocols";
import type { Protocol } from "@codaco/protocol-validation";

const mockProtocol: Protocol = {
	name: "Test Protocol",
	description: "test description",
	schemaVersion: 8,
	stages: [],
	codebook: {
		node: {},
		edge: {},
		ego: {},
	},
	assetManifest: {},
};

const mockProtocol2: Protocol = {
	name: "Another Protocol",
	description: "another description",
	schemaVersion: 8,
	stages: [],
	codebook: {
		node: {},
		edge: {},
		ego: {},
	},
	assetManifest: {},
};

describe("protocols", () => {
	describe("reducer", () => {
		let store: any;

		beforeEach(() => {
			store = configureStore({
				reducer: { protocols: protocolsReducer },
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});
		});

		it("should have an empty initial state", () => {
			const state = store.getState().protocols;
			expect(state).toEqual({});
		});

		it("should add a protocol", () => {
			const protocolId = "test-id-123";

			store.dispatch(
				addProtocol({
					id: protocolId,
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			const state = store.getState().protocols;

			expect(state[protocolId]).toBeDefined();
			expect(state[protocolId].id).toBe(protocolId);
			expect(state[protocolId].name).toBe("Test Protocol");
			expect(state[protocolId].description).toBe("test description");
			expect(state[protocolId].protocol).toEqual(mockProtocol);
			expect(state[protocolId].createdAt).toBeDefined();
			expect(state[protocolId].updatedAt).toBeDefined();
			expect(state[protocolId].lastModified).toBeDefined();
		});

		it("should update a protocol", () => {
			const protocolId = "test-id-123";

			// Add initial protocol
			store.dispatch(
				addProtocol({
					id: protocolId,
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			// Update protocol
			const updatedProtocol = { ...mockProtocol, description: "updated description" };
			store.dispatch(
				updateProtocol({
					id: protocolId,
					protocol: updatedProtocol,
				}),
			);

			const state = store.getState().protocols;

			expect(state[protocolId].protocol.description).toBe("updated description");
		});

		it("should update protocol metadata", () => {
			const protocolId = "test-id-123";

			// Add initial protocol
			store.dispatch(
				addProtocol({
					id: protocolId,
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			// Update metadata
			store.dispatch(
				updateProtocolMetadata({
					id: protocolId,
					name: "Updated Name",
					description: "Updated Description",
				}),
			);

			const state = store.getState().protocols;

			expect(state[protocolId].name).toBe("Updated Name");
			expect(state[protocolId].description).toBe("Updated Description");
		});

		it("should remove a protocol", () => {
			const protocolId = "test-id-123";

			// Add protocol
			store.dispatch(
				addProtocol({
					id: protocolId,
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			// Remove protocol
			store.dispatch(removeProtocol(protocolId));

			const state = store.getState().protocols;

			expect(state[protocolId]).toBeUndefined();
		});

		it("should handle duplicate protocol IDs by updating existing", () => {
			const protocolId = "test-id-123";

			// Add initial protocol
			store.dispatch(
				addProtocol({
					id: protocolId,
					protocol: mockProtocol,
					name: "Original Name",
					description: "Original Description",
				}),
			);

			const originalCreatedAt = store.getState().protocols[protocolId].createdAt;

			// Add same protocol ID again (should update)
			store.dispatch(
				addProtocol({
					id: protocolId,
					protocol: mockProtocol2,
					name: "Updated Name",
					description: "Updated Description",
				}),
			);

			const state = store.getState().protocols;

			expect(state[protocolId].name).toBe("Updated Name");
			expect(state[protocolId].description).toBe("Updated Description");
			expect(state[protocolId].protocol).toEqual(mockProtocol2);
			expect(state[protocolId].createdAt).toBe(originalCreatedAt); // Should preserve original createdAt
		});
	});

	describe("selectors", () => {
		let store: any;
		const protocol1Id = "protocol-1";
		const protocol2Id = "protocol-2";

		beforeEach(() => {
			store = configureStore({
				reducer: { protocols: protocolsReducer },
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});

			// Add test protocols
			store.dispatch(
				addProtocol({
					id: protocol1Id,
					protocol: mockProtocol,
					name: "Protocol 1",
					description: "First protocol",
				}),
			);

			// Wait a bit to ensure different timestamps
			setTimeout(() => {
				store.dispatch(
					addProtocol({
						id: protocol2Id,
						protocol: mockProtocol2,
						name: "Protocol 2",
						description: "Second protocol",
					}),
				);
			}, 1);
		});

		it("should select all protocols", () => {
			const state = store.getState();
			const allProtocols = selectAllProtocols(state);

			expect(allProtocols).toHaveLength(2);
			expect(allProtocols[0].id).toBe(protocol2Id); // Should be sorted by lastModified desc
			expect(allProtocols[1].id).toBe(protocol1Id);
		});

		it("should select protocol by ID", () => {
			const state = store.getState();
			const protocol = selectProtocolById(protocol1Id)(state);

			expect(protocol).toBeDefined();
			expect(protocol?.id).toBe(protocol1Id);
			expect(protocol?.name).toBe("Protocol 1");
		});

		it("should return undefined for non-existent protocol ID", () => {
			const state = store.getState();
			const protocol = selectProtocolById("non-existent")(state);

			expect(protocol).toBeUndefined();
		});

		it("should select recent protocols with limit", () => {
			const state = store.getState();
			const recentProtocols = selectRecentProtocols(1)(state);

			expect(recentProtocols).toHaveLength(1);
			expect(recentProtocols[0].id).toBe(protocol2Id); // Most recent
		});

		it("should check if protocol exists", () => {
			const state = store.getState();

			expect(selectProtocolExists(protocol1Id)(state)).toBe(true);
			expect(selectProtocolExists("non-existent")(state)).toBe(false);
		});
	});

	describe("generateProtocolId", () => {
		it("should generate consistent IDs for the same protocol", async () => {
			const id1 = await generateProtocolId(mockProtocol);
			const id2 = await generateProtocolId(mockProtocol);

			expect(id1).toBe(id2);
			expect(id1).toHaveLength(16); // First 16 chars of SHA-256 hash
		});

		it("should generate different IDs for different protocols", async () => {
			const id1 = await generateProtocolId(mockProtocol);
			const id2 = await generateProtocolId(mockProtocol2);

			expect(id1).not.toBe(id2);
		});
	});
});
