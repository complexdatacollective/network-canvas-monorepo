import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import { times } from "lodash";
import { v4 as uuid } from "uuid";
import createTimeline, { timelineActions } from "../timeline";

vi.mock("uuid");

uuid.mockImplementation(() => crypto.randomBytes(20).toString("hex"));

const defaultReducer = vi.fn(() => ({
	dummyState: true,
	randomProperty: crypto.randomBytes(20).toString("hex"),
}));

const getRewindableReducer = (reducer = defaultReducer, options = {}) => createTimeline(reducer, options);

describe("timeline middleware", () => {
	let rewindableReducer;

	beforeEach(() => {
		rewindableReducer = getRewindableReducer();
	});

	describe("createTimeline middleware", () => {
		it("modifies an existing reducer to contain past present future", () => {
			const mockState = { foo: "bar" };
			const reducer = () => mockState;
			const timelineReducer = createTimeline(reducer);
			const state = timelineReducer(undefined, { type: "@@INIT" });

			expect(state).toEqual(
				expect.objectContaining({
					past: expect.any(Array),
					present: mockState,
					timeline: expect.any(Array),
				}),
			);
		});

		it("each subsequent call adds an event to the timeline", () => {
			const nextState = times(3).reduce((state) => rewindableReducer(state, {}), undefined);

			expect(nextState.past.length).toBe(2);
			expect(nextState.timeline.length).toBe(3); // +1 includes name for present
		});

		it("each subsequent call adds an event to the timeline (unless state is unchanged)", () => {
			const initialState = { foo: "bar" };
			const reducer = (state = initialState) => state;
			const timelineReducer = createTimeline(reducer);

			const nextState = times(3).reduce((state) => timelineReducer(state, {}), undefined);

			expect(nextState.past.length).toBe(0);
			expect(nextState.timeline.length).toBe(1);
		});
	});

	describe("jump() action", () => {
		it("can revert to a specific point on the timeline", () => {
			const nextState = times(10).reduce((state) => rewindableReducer(state, {}), undefined);

			const rollbackState = rewindableReducer(nextState, timelineActions.jump(nextState.timeline[4]));

			expect(rollbackState.past).toEqual(nextState.past.slice(0, 4));
			expect(rollbackState.timeline).toEqual(nextState.timeline.slice(0, 5));
			expect(rollbackState.present).toEqual(nextState.past[4]);
		});

		it("if point does not exist it ignores action", () => {
			const nextState = times(10).reduce((state) => rewindableReducer(state, {}), undefined);

			const rollbackState = rewindableReducer(nextState, timelineActions.jump("NON_EXISTENT_POINT"));

			expect(rollbackState.past).toEqual(nextState.past);
			expect(rollbackState.timeline).toEqual(nextState.timeline);
			expect(rollbackState.present).toEqual(nextState.present);
		});
	});

	describe("reset() action", () => {
		it("can revert to an unused state", () => {
			const nextState = times(10).reduce((state) => rewindableReducer(state, {}), undefined);

			const resetState = rewindableReducer(nextState, timelineActions.reset());

			expect(resetState).toEqual(
				expect.objectContaining({
					past: expect.any(Array),
					present: expect.anything(),
					timeline: expect.any(Array),
				}),
			);

			expect(nextState.timeline.length).toBe(10);
			expect(resetState.timeline.length).toBe(1);
			expect(resetState.past.length).toBe(0);
		});
	});

	describe("undo() action", () => {
		it("moves to previous state", () => {
			const nextState = times(5).reduce((state) => rewindableReducer(state, {}), undefined);

			const undoState = rewindableReducer(nextState, timelineActions.undo());

			expect(undoState.past.length).toBe(3);
			expect(undoState.timeline.length).toBe(4);
			expect(undoState.present).toEqual(nextState.past[3]);
		});

		it("moves present to future when undoing", () => {
			const nextState = times(3).reduce((state) => rewindableReducer(state, {}), undefined);

			const undoState = rewindableReducer(nextState, timelineActions.undo());

			expect(undoState.future).toHaveLength(1);
			expect(undoState.future[0]).toEqual(nextState.present);
			expect(undoState.futureTimeline).toHaveLength(1);
		});

		it("does nothing if no past history", () => {
			const initialState = rewindableReducer(undefined, { type: "@@INIT" });

			const undoState = rewindableReducer(initialState, timelineActions.undo());

			expect(undoState.past).toEqual([]);
			expect(undoState.present).toEqual(initialState.present);
		});
	});

	describe("redo() action", () => {
		it("moves to next state in future", () => {
			const nextState = times(5).reduce((state) => rewindableReducer(state, {}), undefined);
			const undoState = rewindableReducer(nextState, timelineActions.undo());

			const redoState = rewindableReducer(undoState, timelineActions.redo());

			expect(redoState.past.length).toBe(4);
			expect(redoState.timeline.length).toBe(5);
			expect(redoState.present).toEqual(nextState.present);
			expect(redoState.future).toHaveLength(0);
		});

		it("handles multiple redos", () => {
			const nextState = times(5).reduce((state) => rewindableReducer(state, {}), undefined);
			const undoState1 = rewindableReducer(nextState, timelineActions.undo());
			const undoState2 = rewindableReducer(undoState1, timelineActions.undo());

			expect(undoState2.future).toHaveLength(2);

			const redoState1 = rewindableReducer(undoState2, timelineActions.redo());
			expect(redoState1.future).toHaveLength(1);

			const redoState2 = rewindableReducer(redoState1, timelineActions.redo());
			expect(redoState2.future).toHaveLength(0);
			expect(redoState2.present).toEqual(nextState.present);
		});

		it("does nothing if no future history", () => {
			const nextState = times(3).reduce((state) => rewindableReducer(state, {}), undefined);

			const redoState = rewindableReducer(nextState, timelineActions.redo());

			expect(redoState.future).toEqual([]);
			expect(redoState.present).toEqual(nextState.present);
		});
	});

	describe("undo/redo interaction", () => {
		it("clears future when making a new change after undo", () => {
			const nextState = times(3).reduce((state) => rewindableReducer(state, {}), undefined);
			const undoState = rewindableReducer(nextState, timelineActions.undo());

			expect(undoState.future).toHaveLength(1);

			const newChangeState = rewindableReducer(undoState, { type: "NEW_ACTION" });

			expect(newChangeState.future).toHaveLength(0);
			expect(newChangeState.futureTimeline).toHaveLength(0);
		});
	});

	describe("options", () => {
		describe("limit", () => {
			beforeEach(() => {
				const options = {
					limit: 3,
				};

				rewindableReducer = getRewindableReducer(undefined, options);
			});

			it("timeline is limited to 3 items", () => {
				const nextState = times(10).reduce((state) => rewindableReducer(state, {}), undefined);

				expect(nextState.past.length).toBe(3);
				expect(nextState.timeline.length).toBe(4); // +1 includes name for present
			});
		});

		describe("filter", () => {
			const ignoredType = "MUTATING_THE_TIMELINE";

			beforeEach(() => {
				const options = {
					exclude: (action) => action.type === ignoredType,
				};
				rewindableReducer = getRewindableReducer(undefined, options);
			});

			it("actions that are excluded do not create points on the timeline", () => {
				// Add some regular actions
				const nextState = times(3).reduce((state) => rewindableReducer(state, {}), undefined);

				// Add some ignored actions
				const filteredState = times(3).reduce((state) => rewindableReducer(state, { type: ignoredType }), nextState);

				expect(filteredState.past.length).toBe(2);
				expect(filteredState.timeline.length).toBe(3); // +1 includes name for present
			});
		});
	});
});
