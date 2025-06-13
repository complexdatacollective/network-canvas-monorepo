import { describe, it, expect, beforeEach, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import reducer, { actionCreators } from "../dialogs";

describe("dialogs", () => {
	it("initialState", () => {
		expect(reducer(undefined, { type: "@@INIT" })).toEqual({
			dialogs: [],
		});
	});

	describe("async actions", () => {
		let store;

		beforeEach(() => {
			store = configureStore({ 
				reducer,
				middleware: (getDefaultMiddleware) =>
					getDefaultMiddleware({
						serializableCheck: {
							ignoredPaths: ['dialogs'],
							ignoredActions: ['dialogs/addDialog']
						}
					})
			});
		});

		it("OPEN and CLOSE_DIALOG", () => {
			const dialog = { foo: "bar" };

			store.dispatch(actionCreators.openDialog(dialog));

			const state = store.getState();

			expect(store.getState()).toMatchObject({
				dialogs: [{ ...dialog }],
			});

			store.dispatch(actionCreators.closeDialog(state.dialogs[0].id));

			expect(store.getState()).toMatchObject({
				dialogs: [],
			});
		});
	});

	describe("openDialog", () => {
		let store;
		const getDialog = () => ({
			foo: "bar",
			onCancel: vi.fn(),
			onConfirm: vi.fn(),
		});

		beforeEach(() => {
			store = configureStore({ 
				reducer,
				middleware: (getDefaultMiddleware) =>
					getDefaultMiddleware({
						serializableCheck: {
							ignoredPaths: ['dialogs'],
							ignoredActions: ['dialogs/addDialog', 'dialogs/openDialog/pending', 'dialogs/openDialog/fulfilled']
						}
					})
			});
		});

		it("Returns a promise", () => {
			const dialog = getDialog();

			expect.assertions(1);

			const result = store.dispatch(actionCreators.openDialog(dialog));
			expect(result).toBeInstanceOf(Promise);
		});

		it("Promise resolves to `false` when onCancel is called", async () => {
			const dialog = getDialog();

			expect.assertions(1);

			const resultPromise = store.dispatch(actionCreators.openDialog(dialog));

			const state = store.getState();
			state.dialogs[0].onCancel();

			const result = await resultPromise;
			expect(result.payload).toBe(false);
		});

		it("Promise resolves to `true` when onConfirm is called", async () => {
			const dialog = getDialog();

			expect.assertions(1);

			const resultPromise = store.dispatch(actionCreators.openDialog(dialog));

			const state = store.getState();
			state.dialogs[0].onConfirm();

			const result = await resultPromise;
			expect(result.payload).toBe(true);
		});
	});
});
