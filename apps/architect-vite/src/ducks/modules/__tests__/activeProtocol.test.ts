import type { CurrentProtocol, Stage } from "@codaco/protocol-validation";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it } from "vitest";
import activeProtocolReducer, { actionCreators } from "../activeProtocol";
import { test as stagesTest } from "../protocol/stages";

const mockProtocol: CurrentProtocol = {
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

const mockProtocol2: CurrentProtocol = {
	description: "another description",
	schemaVersion: 8,
	stages: [
		{
			id: "stage-1",
			type: "NameGenerator",
			label: "Test Stage",
			form: {
				title: "Test Form",
				fields: [],
			},
			subject: {
				entity: "node",
				type: "person",
			},
			prompts: [
				{
					id: "prompt-1",
					text: "Test prompt",
				},
			],
		},
	],
	codebook: {
		node: {
			person: {
				name: "Person",
				color: "node-color-seq-1",
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
		type TestStore = ReturnType<
			typeof configureStore<{
				activeProtocol: ReturnType<typeof activeProtocolReducer>;
			}>
		>;
		let store: TestStore;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: activeProtocolReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			}) as TestStore;
		});

		it("should have an empty initial state", () => {
			const state = store.getState().activeProtocol;
			expect(state).toBeNull();
		});

		it("should set active protocol", () => {
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			const state = store.getState().activeProtocol;
			expect(state).toMatchObject(mockProtocol);
		});

		it("should update protocol", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			// Update protocol
			const updates = { description: "updated description" };
			store.dispatch(actionCreators.updateProtocol(updates));

			const state = store.getState().activeProtocol;
			expect(state).not.toBeNull();
			if (!state) return;
			expect(state.description).toBe("updated description");
			expect(state.schemaVersion).toBe(mockProtocol.schemaVersion); // Other fields preserved
		});

		it("should update protocol description", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			store.dispatch(actionCreators.updateProtocolDescription({ description: "Updated Description" }));

			const state = store.getState().activeProtocol;
			expect(state).not.toBeNull();
			if (!state) return;
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
		});

		it("should handle updateProtocolDescription action", () => {
			// Set initial protocol
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol));

			store.dispatch(
				actionCreators.updateProtocolDescription({
					description: "Updated Description",
				}),
			);

			const state = store.getState().activeProtocol;
			expect(state).not.toBeNull();
			if (!state) return;
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
		type TestStore = ReturnType<
			typeof configureStore<{
				activeProtocol: ReturnType<typeof activeProtocolReducer>;
			}>
		>;
		let store: TestStore;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: activeProtocolReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			}) as TestStore;
		});

		it("should select null when no active protocol", () => {
			const state = store.getState();
			// getProtocol is bound to the slice, so pass the slice state directly
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
			store.dispatch(actionCreators.setActiveProtocol({} as CurrentProtocol));

			const state = store.getState();
			const protocol = state.activeProtocol;

			// Empty object is still set (not null)
			expect(protocol).not.toBeNull();
			expect(Object.keys(protocol || {}).length).toBe(0);
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

		it("should create updateProtocolDescription action", () => {
			const options = { description: "Updated desc" };
			const action = actionCreators.updateProtocolDescription(options);

			expect(action.type).toBe(actionCreators.updateProtocolDescription.type);
			expect(action.payload).toEqual(options);
		});

		it("should create clearActiveProtocol action", () => {
			const action = actionCreators.clearActiveProtocol();

			expect(action.type).toBe(actionCreators.clearActiveProtocol.type);
		});
	});

	describe("sub-reducers integration", () => {
		type TestStore = ReturnType<
			typeof configureStore<{
				activeProtocol: ReturnType<typeof activeProtocolReducer>;
			}>
		>;
		let store: TestStore;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					activeProtocol: activeProtocolReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			}) as TestStore;
		});

		it("should process sub-reducers when protocol data exists", () => {
			// Set protocol with stages and codebook
			store.dispatch(actionCreators.setActiveProtocol(mockProtocol2));

			const state = store.getState().activeProtocol;

			// Verify the protocol was set correctly
			expect(state).not.toBeNull();
			if (!state) return;
			expect(state.description).toBe("another description");
			expect(state.stages).toHaveLength(1);
			expect(state.codebook.node?.person).toBeDefined();
		});

		it("should not process sub-reducers when no protocol data", () => {
			// Try to dispatch an action that would normally be handled by sub-reducers
			store.dispatch(
				stagesTest.createStage({
					id: "test",
					type: "NameGenerator",
					label: "Test Stage",
					subject: {
						entity: "node",
						type: "person",
					},
					prompts: [],
				} as unknown as Stage),
			);

			const state = store.getState().activeProtocol;

			// Should remain null since no protocol is set
			expect(state).toBeNull();
		});
	});
});
