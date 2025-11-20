import {
	createAction,
	createSlice,
	current,
	type Draft,
	type PayloadAction,
	type Reducer,
	type UnknownAction,
} from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";

// Types
type TimelineState<T = unknown> = {
	past: T[];
	present: T | null;
	timeline: string[];
	future: T[];
	futureTimeline: string[];
};

type TimelineOptions = {
	name?: string;
	limit?: number;
	exclude?: (action: UnknownAction) => boolean;
};

const defaultOptions: Required<TimelineOptions> = {
	name: "timeline",
	limit: 1000,
	exclude: () => false,
};

// Create standalone actions using createAction
export const timelineActions = {
	jump: createAction<string, "timeline/jump">("timeline/jump"),
	reset: createAction<void, "timeline/reset">("timeline/reset"),
	undo: createAction<void, "timeline/undo">("timeline/undo"),
	redo: createAction<void, "timeline/redo">("timeline/redo"),
};

const createTimelineReducer = <T>(
	reducer: Reducer<T>,
	customOptions: TimelineOptions = {},
): Reducer<TimelineState<T>, UnknownAction> => {
	const options = {
		...defaultOptions,
		...customOptions,
	};

	const initialState: TimelineState<T> = {
		past: [],
		present: null,
		timeline: [],
		future: [],
		futureTimeline: [],
	};

	// Create slice that handles both timeline actions and wraps the original reducer
	const timelineSlice = createSlice({
		name: options.name,
		initialState,
		reducers: {},
		extraReducers: (builder) => {
			builder
				.addCase(timelineActions.undo, (state) => {
					const { past, present, timeline, future = [], futureTimeline = [] } = state;

					if (past.length === 0 || !present) {
						return;
					}

					const newPresent = past[past.length - 1];
					const newFuture = [current(present), ...current(future || [])];
					const newFutureTimeline = [timeline[timeline.length - 1], ...(futureTimeline || [])];

					const newPast = past.slice(0, -1);
					const newTimeline = timeline.slice(0, -1);

					state.past = newPast;
					state.present = newPresent as Draft<T>;
					state.timeline = newTimeline;
					state.future = newFuture;
					state.futureTimeline = newFutureTimeline;
				})
				.addCase(timelineActions.jump, (state, action: PayloadAction<string>) => {
					const { past, timeline } = state;
					const locus = action.payload;

					if (!locus) {
						return state;
					}

					const locusIndex = timeline.indexOf(locus);

					// If point in timeline cannot be found do nothing
					if (locusIndex === -1) {
						return;
					}

					// no events in timeline yet
					if (timeline.length === 1) {
						return;
					}

					// the last point in the timeline is the present
					if (locusIndex === timeline.length - 1) {
						return;
					}

					const newPresent = past[locusIndex];

					state.past = past.slice(0, locusIndex);
					state.present = newPresent as Draft<T>;
					state.timeline = timeline.slice(0, locusIndex + 1);
				})
				.addCase(timelineActions.redo, (state) => {
					const { future = [], futureTimeline = [], present, past, timeline } = state;

					// Need at least one item in future to redo
					if (!future || future.length === 0) {
						return;
					}

					// Move first future item to present
					const newPresent = future[0];
					const newLocus = futureTimeline[0];

					// Move current present to past
					const newPast = present ? [...past, current(present)] : past;
					const newTimeline = [...timeline, newLocus];

					state.past = newPast;
					state.present = newPresent as Draft<T>;
					state.timeline = newTimeline;
					state.future = future.slice(1);
					state.futureTimeline = futureTimeline.slice(1);
				})
				.addCase(timelineActions.reset, (state) => {
					const locus = uuid();
					const newPresent = reducer(state.present as T, { type: "@@RESET" });

					state.past = [];
					state.present = newPresent as Draft<T> | undefined;
					state.timeline = [locus];
					state.future = [];
					state.futureTimeline = [];
				})
				.addDefaultCase((state, action) => {
					// Don't process timeline actions here - they're handled by the cases above
					if (
						action &&
						(timelineActions.jump.match(action) ||
							timelineActions.reset.match(action) ||
							timelineActions.undo.match(action) ||
							timelineActions.redo.match(action))
					) {
						return state;
					}

					// Initialize future arrays if they don't exist (for backwards compatibility with persisted state)
					if (!state.future) {
						state.future = [];
					}
					if (!state.futureTimeline) {
						state.futureTimeline = [];
					}

					// Clean up null values from past array (for backwards compatibility with persisted state)
					if (state.past?.some((p) => p === null || p === undefined)) {
						state.past = state.past.filter((p) => p !== null && p !== undefined);
					}

					const { past, present, timeline } = state;

					// Clone present BEFORE calling reducer, because reducer mutates in place
					const presentSnapshot = present ? structuredClone(current(present)) : null;
					const newPresent = reducer(present as T, action);

					// This is the first run
					if (timeline.length === 0) {
						const locus = uuid();
						state.past = [];
						state.present = newPresent as Draft<T> | undefined;
						state.timeline = [locus];
						state.future = [];
						state.futureTimeline = [];
						return;
					}

					// If newPresent matches the old one, don't treat as a new point in the timeline
					if (present === newPresent) {
						return state;
					}

					// If this is setActiveProtocol, reset the timeline (loading a new protocol)
					if (action.type === "activeProtocol/setActiveProtocol") {
						const locus = uuid();
						state.past = [];
						state.present = newPresent as Draft<T> | undefined;
						state.timeline = [locus];
						state.future = [];
						state.futureTimeline = [];
						return;
					}

					// If excluded, we don't treat this as a new point in the timeline, but we do update the state
					if (options.exclude(action)) {
						state.past = past;
						state.present = newPresent as Draft<T> | undefined;
						state.timeline = timeline;
						return;
					}

					// clear future when making a new change
					state.future = [];
					state.futureTimeline = [];

					const locus = uuid();
					const newTimeline = [...timeline, locus].slice(-options.limit - 1);

					const validPast = [...past];
					if (presentSnapshot) {
						validPast.push(presentSnapshot);
					}

					state.past = validPast.slice(-options.limit);
					state.present = newPresent as Draft<T> | undefined;
					state.timeline = newTimeline;
				});
		},
	});

	return timelineSlice.reducer;
};

// export action creators for the timeline actions
export const timelineActionCreators = {
	jump: (locus: string) => timelineActions.jump(locus),
	reset: () => timelineActions.reset(),
};

export default createTimelineReducer;
