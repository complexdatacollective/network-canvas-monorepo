import { describe, it, expect, beforeEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import activeProtocolReducer, {
	actionCreators,
	actionTypes,
	selectActiveProtocol,
	selectHasActiveProtocol,
} from "../activeProtocol";
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
		let store: any;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: {
						present: activeProtocolReducer,
						past: () => [],
						future: () => [],
						timeline: () => [],
					},
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});
		});

		it("should have an empty initial state", () => {
			const state = store.getState().activeProtocol.present;
			expect(state).toEqual({});
		});

		it("should set active protocol", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState().activeProtocol.present;
			expect(state).toEqual(mockProtocol);
		});

		it("should update protocol", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update protocol
			const updates = { description: "updated description" };
			store.dispatch(actionCreators.updateProtocol(updates));

			const state = store.getState().activeProtocol.present;
			expect(state.description).toBe("updated description");
			expect(state.name).toBe(mockProtocol.name); // Other fields preserved
		});

		it("should update protocol options", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update options
			const options = { name: "Updated Name", description: "Updated Description" };
			store.dispatch(actionCreators.updateProtocolOptions(options));

			const state = store.getState().activeProtocol.present;
			expect(state.name).toBe("Updated Name");
			expect(state.description).toBe("Updated Description");
			expect(state.stages).toEqual(mockProtocol.stages); // Other fields preserved
		});

		it("should clear active protocol", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Clear protocol
			store.dispatch(actionCreators.clearActiveProtocol());

			const state = store.getState().activeProtocol.present;
			expect(state).toEqual({});
		});

		it("should handle legacy setProtocol action", () => {
			store.dispatch(actionCreators.setProtocol({ meta: "test" }, mockProtocol));

			const state = store.getState().activeProtocol.present;
			expect(state).toEqual(mockProtocol);
		});

		it("should handle legacy updateOptions action", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update options using legacy action
			store.dispatch(
				actionCreators.updateOptions({
					name: "Legacy Updated Name",
					description: "Legacy Updated Description",
				}),
			);

			const state = store.getState().activeProtocol.present;
			expect(state.name).toBe("Legacy Updated Name");
			expect(state.description).toBe("Legacy Updated Description");
		});

		it("should handle SESSION/RESET_SESSION action", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Reset session
			store.dispatch({ type: "SESSION/RESET_SESSION" });

			const state = store.getState().activeProtocol.present;
			expect(state).toEqual({});
		});

		it("should handle SESSION/OPEN_NETCANVAS_SUCCESS action", () => {
			store.dispatch({
				type: "SESSION/OPEN_NETCANVAS_SUCCESS",
				payload: { protocol: mockProtocol },
			});

			const state = store.getState().activeProtocol.present;
			expect(state).toEqual(mockProtocol);
		});

		it("should handle legacy PROTOCOL/SET action", () => {
			store.dispatch({
				type: "PROTOCOL/SET",
				protocol: mockProtocol,
			});

			const state = store.getState().activeProtocol.present;
			expect(state).toEqual(mockProtocol);
		});

		it("should handle legacy PROTOCOL/UPDATE_OPTIONS action", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update options using legacy action type
			store.dispatch({
				type: "PROTOCOL/UPDATE_OPTIONS",
				options: { name: "Legacy Action Name", description: "Legacy Action Description" },
			});

			const state = store.getState().activeProtocol.present;
			expect(state.name).toBe("Legacy Action Name");
			expect(state.description).toBe("Legacy Action Description");
		});
	});

	describe("selectors", () => {
		let store: any;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: {
						present: activeProtocolReducer,
						past: () => [],
						future: () => [],
						timeline: () => [],
					},
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});
		});

		it("should select null when no active protocol", () => {
			const state = store.getState();
			const protocol = selectActiveProtocol(state);

			expect(protocol).toBeNull();
		});

		it("should select active protocol", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState();
			const protocol = selectActiveProtocol(state);

			expect(protocol).toEqual(mockProtocol);
		});

		it("should return false when no active protocol", () => {
			const state = store.getState();
			const hasProtocol = selectHasActiveProtocol(state);

			expect(hasProtocol).toBe(false);
		});

		it("should return true when active protocol exists", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState();
			const hasProtocol = selectHasActiveProtocol(state);

			expect(hasProtocol).toBe(true);
		});

		it("should return false for empty protocol object", () => {
			// Directly set empty state
			store.dispatch(actionCreators.setActiveProtocol({} as Protocol));

			const state = store.getState();
			const protocol = selectActiveProtocol(state);
			const hasProtocol = selectHasActiveProtocol(state);

			expect(protocol).toBeNull();
			expect(hasProtocol).toBe(false);
		});
	});

	describe("action creators", () => {
		it("should create setActiveProtocol action", () => {
			const action = actionCreators.setActiveProtocol(mockProtocol);

			expect(action.type).toBe(actionTypes.SET_ACTIVE_PROTOCOL);
			expect(action.payload).toEqual(mockProtocol);
		});

		it("should create updateProtocol action", () => {
			const updates = { description: "updated" };
			const action = actionCreators.updateProtocol(updates);

			expect(action.type).toBe(actionTypes.UPDATE_PROTOCOL);
			expect(action.payload).toEqual(updates);
		});

		it("should create updateProtocolOptions action", () => {
			const options = { name: "Updated", description: "Updated desc" };
			const action = actionCreators.updateProtocolOptions(options);

			expect(action.type).toBe(actionTypes.UPDATE_PROTOCOL_OPTIONS);
			expect(action.payload).toEqual(options);
		});

		it("should create clearActiveProtocol action", () => {
			const action = actionCreators.clearActiveProtocol();

			expect(action.type).toBe(actionTypes.CLEAR_ACTIVE_PROTOCOL);
		});
	});

	describe("sub-reducers integration", () => {
		let store: any;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: {
						present: activeProtocolReducer,
						past: () => [],
						future: () => [],
						timeline: () => [],
					},
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			});
		});

		it("should process sub-reducers when protocol data exists", () => {
			// Set protocol with stages and codebook
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol2));

			const state = store.getState().activeProtocol.present;

			// Verify the protocol was set correctly
			expect(state.name).toBe("Another Protocol");
			expect(state.stages).toHaveLength(1);
			expect(state.codebook.node.person).toBeDefined();
		});

		it("should not process sub-reducers when no protocol data", () => {
			// Try to dispatch an action that would normally be handled by sub-reducers
			store.dispatch({ type: "STAGES/CREATE_STAGE", stage: { id: "test" } });

			const state = store.getState().activeProtocol.present;

			// Should remain empty since no protocol is set
			expect(state).toEqual({});
		});
	});
});
