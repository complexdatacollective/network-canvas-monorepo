import type { StageEntity } from "@codaco/protocol-validation";
import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import reducer, { actionCreators, test } from "../stages";

const mockStages = [
	{ id: "3", type: "Stage", stageType: "Information", label: "Foo" },
	{
		id: "9",
		type: "Stage",
		stageType: "NameGenerator",
		label: "Bar",
		prompts: [
			{ id: "7", text: "prompt" },
			{ id: "3", text: "prompt2" },
			{ id: "5", text: "prompt3" },
		],
	},
	{ id: "5", type: "Stage", stageType: "OrdinalBin", label: "Baz" },
] as StageEntity[];

// Create a test store for async actions
const createTestStore = (initialStages: StageEntity[] = []) => {
	return configureStore({
		reducer: {
			stages: reducer,
			// Mock other reducers that might be needed
			protocol: () => ({
				present: {
					timeline: {
						start: "",
						entities: initialStages,
					},
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
				const newStage = { id: "new", type: "Stage", stageType: "Information", label: "" } as StageEntity;

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

				expect(updatedStages[1]).toMatchObject({
					label: "Hello world",
					stageType: "NameGenerator",
				});
			});

			it("Replaces stage object if overwrite is true", () => {
				const updatedStage = { something: "different" } as unknown as StageEntity;

				const updatedStages = reducer(mockStages, test.updateStage("9", updatedStage, true));

				expect(updatedStages[1]).toEqual({ id: "9", something: "different" });
			});
		});

		describe("deleteStage", () => {
			it("Deletes the stage with stageId", () => {
				const updatedStages = reducer(mockStages, test.deleteStage("9"));

				expect(updatedStages).toEqual([
					{ id: "3", type: "Stage", stageType: "Information", label: "Foo" },
					{ id: "5", type: "Stage", stageType: "OrdinalBin", label: "Baz" },
				]);
			});
		});

		describe("deletePrompt", () => {
			it("Deletes the prompt with promptId", () => {
				const updatedStages = reducer(mockStages, test.deletePrompt("9", "3"));

				expect(updatedStages).toEqual([
					{ id: "3", type: "Stage", stageType: "Information", label: "Foo" },
					{
						id: "9",
						type: "Stage",
						stageType: "NameGenerator",
						label: "Bar",
						prompts: [
							{ id: "7", text: "prompt" },
							{ id: "5", text: "prompt3" },
						],
					},
					{ id: "5", type: "Stage", stageType: "OrdinalBin", label: "Baz" },
				]);
			});
		});
	});

	describe("async action creators", () => {
		it.todo("createStageAsync");
		it.todo("deleteStageAsync");
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
