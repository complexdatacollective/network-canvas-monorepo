import type { Protocol } from "@codaco/protocol-validation";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it } from "vitest";
import protocolsReducer, {
	addProtocol,
	removeProtocol,
	selectAllProtocols,
	selectProtocolById,
	selectProtocolExists,
	selectRecentProtocols,
	updateProtocol,
	updateProtocolMetadata,
} from "../protocols";

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
		let store: ReturnType<typeof configureStore<{ protocols: ReturnType<typeof protocolsReducer> }>>;

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
			store.dispatch(
				addProtocol({
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			const state = store.getState().protocols;

			expect(state).toBeDefined();
			expect(state.name).toBe("Test Protocol");
			expect(state.description).toBe("test description");
			expect(state.protocol).toEqual(mockProtocol);
			expect(state.createdAt).toBeDefined();
			expect(state.updatedAt).toBeDefined();
			expect(state.lastModified).toBeDefined();
		});

		it("should update a protocol", () => {
			// Add initial protocol
			store.dispatch(
				addProtocol({
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			// Update protocol
			const updatedProtocol = { ...mockProtocol, description: "updated description" };
			store.dispatch(
				updateProtocol({
					protocol: updatedProtocol,
				}),
			);

			const state = store.getState().protocols;

			expect(state.protocol.description).toBe("updated description");
		});

		it("should update protocol metadata", () => {
			// Add initial protocol
			store.dispatch(
				addProtocol({
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			// Update metadata
			store.dispatch(
				updateProtocolMetadata({
					name: "Updated Name",
					description: "Updated Description",
				}),
			);

			const state = store.getState().protocols;

			expect(state.name).toBe("Updated Name");
			expect(state.description).toBe("Updated Description");
		});

		it("should remove a protocol", () => {
			// Add protocol
			store.dispatch(
				addProtocol({
					protocol: mockProtocol,
					name: mockProtocol.name,
					description: mockProtocol.description,
				}),
			);

			// Remove protocol
			store.dispatch(removeProtocol());

			const state = store.getState().protocols;

			expect(state).toBeUndefined();
		});
	});

	describe("selectors", () => {
		let store: ReturnType<typeof configureStore<{ protocols: ReturnType<typeof protocolsReducer> }>>;
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
});
