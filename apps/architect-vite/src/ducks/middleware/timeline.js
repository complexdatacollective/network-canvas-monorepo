import { get } from "es-toolkit/compat";
import { v4 as uuid } from "uuid";
import { createSlice } from "@reduxjs/toolkit";

const defaultOptions = {
	limit: 1000,
	exclude: () => false,
};

const createTimelineReducer = (reducer, customOptions) => {
	const options = {
		...defaultOptions,
		...customOptions,
	};

	const initialState = {
		past: [],
		present: undefined,
		timeline: [],
	};

	const timelineSlice = createSlice({
		name: 'timeline',
		initialState,
		reducers: {
			jump: (state, action) => {
				const { past, timeline } = state;
				const { locus } = action.payload;

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
				state.present = newPresent;
				state.timeline = timeline.slice(0, locusIndex + 1);
			},
			reset: (state) => {
				const locus = uuid();

				const newPresent = reducer(state.present);

				state.past = [];
				state.present = newPresent;
				state.timeline = [locus];
			},
		},
	});

	const timelineReducer = (state = initialState, action) => {
		// Handle timeline-specific actions
		if (action.type === timelineSlice.actions.jump.type) {
			return timelineSlice.reducer(state, action);
		}

		if (action.type === timelineSlice.actions.reset.type) {
			return timelineSlice.reducer(state, action);
		}

		const { past, present, timeline } = state;
		const newPresent = reducer(present, action);

		// This is the first run
		if (timeline.length === 0) {
			const locus = uuid();

			return {
				past: [],
				present: newPresent,
				timeline: [locus],
			};
		}

		// If newPresent matches the old one, don't treat as a new point in the timeline
		if (present === newPresent) {
			return state;
		}

		// If excluded, we don't treat this as a new
		// point in the timeline, but we do update the state
		if (options.exclude(action)) {
			return {
				past,
				present: newPresent,
				timeline,
			};
		}

		const locus = uuid();

		return {
			past: [...past, present].slice(-options.limit),
			present: newPresent,
			timeline: [...timeline, locus].slice(-options.limit - 1),
		};
	};

	return timelineReducer;
};

export const actionTypes = {
	RESET: 'timeline/reset',
};

export const actionCreators = {
	jump: (locus) => ({ type: 'timeline/jump', payload: { locus } }),
	reset: () => ({ type: 'timeline/reset' }),
};

export default createTimelineReducer;
