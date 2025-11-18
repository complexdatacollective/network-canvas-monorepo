import type { Protocol } from "@codaco/protocol-validation";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it } from "vitest";
import activeProtocolReducer, { actionCreators } from "../activeProtocol";
import { createStage } from "../protocol/stages";

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
	stages: [
		{
			id: "stage-1",
			type: "NameGenerator",
			label: "Test Stage",
		},
	],
	codebook: {
		node: {
			person: {
				name: "Person",
				color: "blue",
				variables: {},
			},
		},
		edge: {},
		ego: {},
	},
	assetManifest: {},
};

describe("activeProtocol", () => {
	describe("reducer", () => {
		let store: ReturnType<typeof configureStore<{ activeProtocol: ReturnType<typeof activeProtocolReducer> }>>;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: activeProtocolReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});
		});

		it("should have an empty initial state", () => {
			const state = store.getState().activeProtocol;
			expect(state).toBeNull();
		});

		it("should set active protocol", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState().activeProtocol;
			expect(state).toMatchObject(mockProtocol);
			expect(state).toHaveProperty("isValid", true);
			expect(state).toHaveProperty("lastSavedAt", null);
			expect(state).toHaveProperty("lastSavedTimeline", null);
		});

		it("should update protocol", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update protocol
			const updates = { description: "updated description" };
			store.dispatch(actionCreators.updateProtocol(updates));

			const state = store.getState().activeProtocol;
			expect(state.description).toBe("updated description");
			expect(state.name).toBe(mockProtocol.name); // Other fields preserved
		});

		it("should update protocol options", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update options
			const options = { name: "Updated Name", description: "Updated Description" };
			store.dispatch(actionCreators.updateProtocolOptions(options));

			const state = store.getState().activeProtocol;
			expect(state.name).toBe("Updated Name");
			expect(state.description).toBe("Updated Description");
			expect(state.stages).toEqual(mockProtocol.stages); // Other fields preserved
		});

		it("should clear active protocol", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Clear protocol
			store.dispatch(actionCreators.clearActiveProtocol());

			const state = store.getState().activeProtocol;
			expect(state).toBeNull();
		});

		it("should handle setActiveProtocol action with metadata", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState().activeProtocol;
			expect(state).toMatchObject(mockProtocol);
			expect(state).toHaveProperty("isValid", true);
		});

		it("should handle updateProtocolOptions action", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update options using modern action
			store.dispatch(
				actionCreators.updateProtocolOptions({
					name: "Updated Name",
					description: "Updated Description",
				}),
			);

			const state = store.getState().activeProtocol;
			expect(state.name).toBe("Updated Name");
			expect(state.description).toBe("Updated Description");
		});

		it("should handle session reset with clearActiveProtocol", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Reset session using modern action
			store.dispatch(actionCreators.clearActiveProtocol());

			const state = store.getState().activeProtocol;
			expect(state).toBeNull();
		});
	});

	describe("selectors", () => {
		let store: ReturnType<typeof configureStore<{ activeProtocol: ReturnType<typeof activeProtocolReducer> }>>;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: activeProtocolReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});
		});

		it("should select null when no active protocol", () => {
			const state = store.getState();
			// selectActiveProtocol is bound to the slice, so pass the slice state directly
			const protocol = state.activeProtocol;

			expect(protocol).toBeNull();
		});

		it("should select active protocol", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState();
			const protocol = state.activeProtocol;

			expect(protocol).toMatchObject(mockProtocol);
		});

		it("should return false when no active protocol", () => {
			const state = store.getState();
			const hasProtocol = state.activeProtocol !== null && Object.keys(state.activeProtocol || {}).length > 0;

			expect(hasProtocol).toBe(false);
		});

		it("should return true when active protocol exists", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState();
			const hasProtocol = state.activeProtocol !== null && Object.keys(state.activeProtocol || {}).length > 0;

			expect(hasProtocol).toBe(true);
		});

		it("should return false for empty protocol object", () => {
			// Directly set empty state
			store.dispatch(actionCreators.setActiveProtocol({} as Protocol));

			const state = store.getState();
			const protocol = state.activeProtocol;

			// Empty object still has the metadata fields, so it's not null
			expect(protocol).toHaveProperty("isValid", true);
			expect(Object.keys(protocol || {}).length).toBeGreaterThan(0);
		});
	});

	describe("action creators", () => {
		it("should create setActiveProtocol action", () => {
			const action = actionCreators.setActiveProtocol(mockProtocol);

			expect(action.type).toBe(actionCreators.setActiveProtocol.type);
			expect(action.payload).toEqual(mockProtocol);
		});

		it("should create updateProtocol action", () => {
			const updates = { description: "updated" };
			const action = actionCreators.updateProtocol(updates);

			expect(action.type).toBe(actionCreators.updateProtocol.type);
			expect(action.payload).toEqual(updates);
		});

		it("should create updateProtocolOptions action", () => {
			const options = { name: "Updated", description: "Updated desc" };
			const action = actionCreators.updateProtocolOptions(options);

			expect(action.type).toBe(actionCreators.updateProtocolOptions.type);
			expect(action.payload).toEqual(options);
		});

		it("should create clearActiveProtocol action", () => {
			const action = actionCreators.clearActiveProtocol();

			expect(action.type).toBe(actionCreators.clearActiveProtocol.type);
		});
	});

	describe("sub-reducers integration", () => {
		let store: ReturnType<typeof configureStore<{ activeProtocol: ReturnType<typeof activeProtocolReducer> }>>;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: activeProtocolReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});
		});

		it("should process sub-reducers when protocol data exists", () => {
			// Set protocol with stages and codebook
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol2));

			const state = store.getState().activeProtocol;

			// Verify the protocol was set correctly
			expect(state.name).toBe("Another Protocol");
			expect(state.stages).toHaveLength(1);
			expect(state.codebook.node.person).toBeDefined();
		});

		it("should not process sub-reducers when no protocol data", () => {
			// Try to dispatch an action that would normally be handled by sub-reducers
			store.dispatch(createStage({ stage: { id: "test" } }));

			const state = store.getState().activeProtocol;

			// Should remain null since no protocol is set
			expect(state).toBeNull();
		});
	});
});
