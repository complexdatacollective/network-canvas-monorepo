import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it } from "vitest";
import protocolMetaReducer, { clearProtocolMeta, setProtocolMeta } from "../protocolMeta";

describe("protocolMeta", () => {
	describe("reducer", () => {
		type TestStore = ReturnType<
			typeof configureStore<{
				protocolMeta: ReturnType<typeof protocolMetaReducer>;
			}>
		>;
		let store: TestStore;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					protocolMeta: protocolMetaReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			}) as TestStore;
		});

		it("should have null as initial state", () => {
			const state = store.getState().protocolMeta;
			expect(state).toBeNull();
		});

		it("should set protocol meta with name", () => {
			store.dispatch(setProtocolMeta({ name: "Test Protocol" }));

			const state = store.getState().protocolMeta;
			expect(state).not.toBeNull();
			expect(state?.name).toBe("Test Protocol");
		});

		it("should replace existing protocol meta when setting new one", () => {
			store.dispatch(setProtocolMeta({ name: "Test Protocol 1" }));
			store.dispatch(setProtocolMeta({ name: "Test Protocol 2" }));

			const state = store.getState().protocolMeta;
			expect(state?.name).toBe("Test Protocol 2");
		});

		it("should clear protocol meta", () => {
			store.dispatch(setProtocolMeta({ name: "Test Protocol" }));
			store.dispatch(clearProtocolMeta());

			const state = store.getState().protocolMeta;
			expect(state).toBeNull();
		});

		it("should handle clearing when already null", () => {
			store.dispatch(clearProtocolMeta());

			const state = store.getState().protocolMeta;
			expect(state).toBeNull();
		});
	});

	describe("updateProtocolMeta", () => {
		type TestStore = ReturnType<
			typeof configureStore<{
				protocolMeta: ReturnType<typeof protocolMetaReducer>;
			}>
		>;
		let store: TestStore;

		beforeEach(() => {
			store = configureStore({
				reducer: {
					protocolMeta: protocolMetaReducer,
				},
				middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
			}) as TestStore;
		});

		it("should update protocol meta name", () => {
			store.dispatch(setProtocolMeta({ name: "Test Protocol" }));

			const updateAction = {
				type: "protocolMeta/updateProtocolMeta",
				payload: { name: "Test Protocol Updated" },
			};
			store.dispatch(updateAction);

			const state = store.getState().protocolMeta;
			expect(state?.name).toBe("Test Protocol Updated");
		});

		it("should not update when state is null", () => {
			const updateAction = {
				type: "protocolMeta/updateProtocolMeta",
				payload: { name: "Test Protocol Updated" },
			};
			store.dispatch(updateAction);

			const state = store.getState().protocolMeta;
			expect(state).toBeNull();
		});

		it("should preserve existing fields when updating", () => {
			store.dispatch(setProtocolMeta({ name: "Test Protocol" }));

			const updateAction = {
				type: "protocolMeta/updateProtocolMeta",
				payload: { name: "Test Protocol Updated" },
			};
			store.dispatch(updateAction);

			const state = store.getState().protocolMeta;
			expect(state).not.toBeNull();
			expect(state?.name).toBe("Test Protocol Updated");
		});
	});

	describe("action creators", () => {
		it("should create setProtocolMeta action", () => {
			const action = setProtocolMeta({ name: "Test Protocol" });

			expect(action.type).toBe("protocolMeta/setProtocolMeta");
			expect(action.payload).toEqual({ name: "Test Protocol" });
		});

		it("should create clearProtocolMeta action", () => {
			const action = clearProtocolMeta();

			expect(action.type).toBe("protocolMeta/clearProtocolMeta");
		});
	});
});
