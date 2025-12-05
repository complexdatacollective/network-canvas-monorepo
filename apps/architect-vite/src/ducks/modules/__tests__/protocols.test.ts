import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProtocolWithMetadata } from "~/types";
import protocolsReducer, { addProtocol, removeProtocol, updateProtocol, updateProtocolMetadata } from "../protocols";

const mockProtocol = {
	name: "Test Protocol" as const,
	description: "test description",
	schemaVersion: 8,
	stages: [],
	codebook: {
		node: {},
		edge: {},
		ego: {},
	},
	assetManifest: {},
} satisfies ProtocolWithMetadata;

const mockProtocol2 = {
	name: "Another Protocol" as const,
	description: "another description",
	schemaVersion: 8,
	stages: [],
	codebook: {
		node: {},
		edge: {},
		ego: {},
	},
	assetManifest: {},
} satisfies ProtocolWithMetadata;

describe("protocols", () => {
	describe("reducer", () => {
		type TestState = { protocols: ReturnType<typeof protocolsReducer> };
		let store: ReturnType<typeof configureStore<TestState>>;

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

			const protocols = store.getState().protocols;
			const addedProtocol = Object.values(protocols)[0];

			expect(protocols).toBeDefined();
			expect(addedProtocol).toBeDefined();
			expect(addedProtocol?.id).toBeDefined();
			expect(addedProtocol?.name).toBe("Test Protocol");
			expect(addedProtocol?.description).toBe("test description");
			expect(addedProtocol?.protocol).toEqual(mockProtocol);
			expect(addedProtocol?.createdAt).toBeDefined();
			expect(addedProtocol?.updatedAt).toBeDefined();
			expect(addedProtocol?.lastModified).toBeDefined();
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
			const updatedProtocol = {
				...mockProtocol,
				description: "updated description",
			};
			store.dispatch(
				updateProtocol({
					protocol: updatedProtocol,
				}),
			);

			const protocols = store.getState().protocols;
			const updated = Object.values(protocols)[0];

			expect(updated?.protocol.description).toBe("updated description");
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

			const protocols = store.getState().protocols;
			const updated = Object.values(protocols)[0];

			expect(updated?.name).toBe("Updated Name");
			expect(updated?.description).toBe("Updated Description");
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
			store.dispatch(removeProtocol(undefined));

			const state = store.getState().protocols;

			expect(state).toEqual({});
		});
	});

	describe("selectors", () => {
		type TestState = { protocols: ReturnType<typeof protocolsReducer> };
		let store: ReturnType<typeof configureStore<TestState>>;
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
			const protocolsData = store.getState().protocols;
			const allProtocols = Object.values(protocolsData).sort((a, b) => b.lastModified - a.lastModified);

			expect(allProtocols).toHaveLength(2);
			expect(allProtocols[0]?.id).toBe(protocol2Id); // Should be sorted by lastModified desc
			expect(allProtocols[1]?.id).toBe(protocol1Id);
		});

		it("should select protocol by ID", () => {
			const protocolsData = store.getState().protocols;
			const protocol = protocolsData[protocol1Id];

			expect(protocol).toBeDefined();
			expect(protocol?.id).toBe(protocol1Id);
			expect(protocol?.name).toBe("Protocol 1");
		});

		it("should return undefined for non-existent protocol ID", () => {
			const protocolsData = store.getState().protocols;
			const protocol = protocolsData["non-existent"];

			expect(protocol).toBeUndefined();
		});

		it("should select recent protocols with limit", () => {
			const protocolsData = store.getState().protocols;
			const allProtocols = Object.values(protocolsData).sort((a, b) => b.lastModified - a.lastModified);
			const recentProtocols = allProtocols.slice(0, 1);

			expect(recentProtocols).toHaveLength(1);
			expect(recentProtocols[0]?.id).toBe(protocol2Id); // Most recent
		});

		it("should check if protocol exists", () => {
			const protocolsData = store.getState().protocols;

			expect(!!protocolsData[protocol1Id]).toBe(true);
			expect(!!protocolsData["non-existent"]).toBe(false);
		});
	});
});
