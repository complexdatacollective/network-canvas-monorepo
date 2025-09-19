import {
	createAction,
	createSlice,
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
	};

	// Create slice that handles both timeline actions and wraps the original reducer
	const timelineSlice = createSlice({
		name: options.name,
		initialState,
		reducers: {},
		extraReducers: (builder) => {
			builder
				.addCase(timelineActions.jump, (state, action: PayloadAction<string>) => {
					const { past, timeline } = state;
					const locus = action.payload;

					if (!locus) {
						return state;
					}

					const locusIndex = timeline.indexOf(locus);

					// If point in timeline cannot be found do nothing
					if (locusIndex === -1) {
						console.warn(`Timeline locus "${locus}" not found in timeline. Cannot jump to it.`);
						return;
					}

					// no events in timeline yet
					if (timeline.length === 1) {
						console.warn(`Timeline locus "${locus}" is the only point in the timeline. Cannot jump to it.`);
						return;
					}

					// the last point in the timeline is the present
					if (locusIndex === timeline.length - 1) {
						console.warn(`Timeline locus "${locus}" is the current point in the timeline. Cannot jump to it.`);
						return;
					}

					const newPresent = past[locusIndex];

					state.past = past.slice(0, locusIndex);
					state.present = newPresent as Draft<T>;
					state.timeline = timeline.slice(0, locusIndex + 1);
				})
				.addCase(timelineActions.reset, (state) => {
					const locus = uuid();
					const newPresent = reducer(state.present as T, { type: "@@RESET" });

					state.past = [];
					state.present = newPresent as Draft<T> | undefined;
					state.timeline = [locus];
				})
				.addDefaultCase((state, action) => {
					// Don't process timeline actions here - they're handled by the cases above
					if (action && (timelineActions.jump.match(action) || timelineActions.reset.match(action))) {
						return state;
					}

					const { past, present, timeline } = state;
					const newPresent = reducer(present as T, action);

					// This is the first run
					if (timeline.length === 0) {
						const locus = uuid();
						state.past = [];
						state.present = newPresent as Draft<T> | undefined;
						state.timeline = [locus];
						return;
					}

					// If newPresent matches the old one, don't treat as a new point in the timeline
					if (present === newPresent) {
						return state;
					}

					// If excluded, we don't treat this as a new point in the timeline, but we do update the state
					if (options.exclude(action)) {
						state.past = past;
						state.present = newPresent as Draft<T> | undefined;
						state.timeline = timeline;
						return;
					}

					const locus = uuid();

					const validPast = [...past];
					if (present !== undefined) {
						validPast.push(present);
					}

					state.past = validPast.slice(-options.limit);
					state.present = newPresent as Draft<T> | undefined;
					state.timeline = [...timeline, locus].slice(-options.limit - 1);
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
export type { TimelineOptions, TimelineState };
