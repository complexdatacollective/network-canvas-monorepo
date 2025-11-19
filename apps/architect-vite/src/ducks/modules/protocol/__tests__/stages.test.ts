import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import type { Stage } from "../stages";
import reducer, { actionCreators, createStageAsync, deleteStageAsync, test } from "../stages";

const mockStages: Stage[] = [
	{ id: "3", type: "Information", label: "Foo" },
	{
		id: "9",
		type: "NameGenerator",
		label: "Bar",
		prompts: [{ id: "7" }, { id: "3" }, { id: "5" }],
	},
	{ id: "5", type: "OrdinalBin", label: "Baz" },
];

// Create a test store for async actions
const createTestStore = (initialStages: Stage[] = []) => {
	return configureStore({
		reducer: {
			stages: reducer,
			// Mock other reducers that might be needed
			protocol: () => ({
				present: {
					stages: initialStages,
				},
			}),
		},
		middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
	});
};

describe("protocol.stages", () => {
	describe("reducer", () => {
		describe("createStage", () => {
			it("Creates a stage", () => {
				const newStage: Stage = { id: "new", type: "Foo", label: "" };

				const appendStageToState = reducer(mockStages, test.createStage(newStage));
				expect(appendStageToState[3]).toMatchObject({ ...newStage });

				const addStageToExistingState = reducer(mockStages, test.createStage(newStage, 1));
				expect(addStageToExistingState[1]).toMatchObject({ ...newStage });
			});
		});

		describe("updateStage", () => {
			it("Merges properties by default", () => {
				const updatedStage = { label: "Hello world" };

				const updatedStages = reducer(mockStages, test.updateStage("9", updatedStage));

				expect(updatedStages[1]).toMatchObject({ label: "Hello world", type: "NameGenerator" });
			});

			it("Replaces stage object if overwrite is true", () => {
				const updatedStage = { something: "different" };

				const updatedStages = reducer(mockStages, test.updateStage("9", updatedStage, true));

				expect(updatedStages[1]).toEqual({ id: "9", something: "different" });
			});
		});

		describe("deleteStage", () => {
			it("Deletes the stage with stageId", () => {
				const updatedStages = reducer(mockStages, test.deleteStage("9"));

				expect(updatedStages).toEqual([
					{ id: "3", type: "Information", label: "Foo" },
					{ id: "5", type: "OrdinalBin", label: "Baz" },
				]);
			});
		});

		describe("deletePrompt", () => {
			it("Deletes the prompt with promptId", () => {
				const updatedStages = reducer(mockStages, test.deletePrompt("9", "3"));

				expect(updatedStages).toEqual([
					{ id: "3", type: "Information", label: "Foo" },
					{
						id: "9",
						type: "NameGenerator",
						label: "Bar",
						prompts: [{ id: "7" }, { id: "5" }],
					},
					{ id: "5", type: "OrdinalBin", label: "Baz" },
				]);
			});
		});
	});

	describe("async action creators", () => {
		it("createStageAsync", async () => {
			const store = createTestStore();

			const resultAction = await store.dispatch(createStageAsync({ options: { type: "Foo" } }));

			expect(createStageAsync.fulfilled.match(resultAction)).toBe(true);
			if (createStageAsync.fulfilled.match(resultAction)) {
				expect(resultAction.payload).toMatchObject({ type: "Foo" });
				expect(typeof resultAction.payload.id).toBe("string");
			}

			const state = store.getState().stages;
			expect(state).toHaveLength(1);
			expect(state[0]).toMatchObject({ type: "Foo" });
		});

		it("deleteStageAsync", async () => {
			const store = createTestStore(mockStages);
			// Initialize store state
			store.dispatch({ type: "stages/createStage", payload: { stage: mockStages[0] } });
			store.dispatch({ type: "stages/createStage", payload: { stage: mockStages[1] } });
			store.dispatch({ type: "stages/createStage", payload: { stage: mockStages[2] } });

			const resultAction = await store.dispatch(deleteStageAsync("9"));

			expect(deleteStageAsync.fulfilled.match(resultAction)).toBe(true);
			if (deleteStageAsync.fulfilled.match(resultAction)) {
				expect(resultAction.payload).toBe("9");
			}

			const state = store.getState().stages;
			expect(state.find((stage) => stage.id === "9")).toBeUndefined();
		});
	});

	describe("sync action creators", () => {
		it("updateStage", () => {
			const _store = createTestStore();

			const action = actionCreators.updateStage("9", { label: "new label" });
			expect(action.type).toBe("stages/updateStage");
			expect(action.payload).toEqual({
				stageId: "9",
				stage: { label: "new label" },
				overwrite: false,
			});
		});

		it("moveStage", () => {
			const action = actionCreators.moveStage(2, 1);
			expect(action.type).toBe("stages/moveStage");
			expect(action.payload).toEqual({ oldIndex: 2, newIndex: 1 });
		});

		it("deletePrompt", () => {
			const action = actionCreators.deletePrompt("9", "3");
			expect(action.type).toBe("stages/deletePrompt");
			expect(action.payload).toEqual({
				stageId: "9",
				promptId: "3",
				deleteEmptyStage: false,
			});
		});
	});
});
