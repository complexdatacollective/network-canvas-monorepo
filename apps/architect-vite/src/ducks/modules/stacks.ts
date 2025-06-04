import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { reduce } from "lodash";

// Define types for the stacks module
interface StackableItem {
	id: string;
	group: string;
	index: number;
}

interface StacksState {
	[id: string]: StackableItem;
}

const getNextIndexForGroup = (indexes: StacksState, group: string): number =>
	reduce(
		indexes,
		(memo, stackable) => {
			if (group === stackable.group && stackable.index >= memo) {
				return stackable.index + 1;
			}
			return memo;
		},
		0,
	);

const defaultGroup = "GLOBAL";

const initialState: StacksState = {
	// id: { index, group }
};

const stacksSlice = createSlice({
	name: "stacks",
	initialState,
	reducers: {
		registerStackable: (state, action: PayloadAction<{ id: string; group?: string }>) => {
			const { id, group = defaultGroup } = action.payload;
			const nextIndex = getNextIndexForGroup(state, group);
			state[id] = {
				id,
				group,
				index: nextIndex,
			};
		},
		unregisterStackable: (state, action: PayloadAction<{ id: string }>) => {
			const { id } = action.payload;
			delete state[id];
		},
		moveToTop: (state, action: PayloadAction<{ id: string }>) => {
			const { id } = action.payload;
			const item = state[id];
			if (!item) {
				return;
			}
			const nextIndex = getNextIndexForGroup(state, item.group);
			state[id] = {
				...item,
				index: nextIndex,
			};
		},
	},
});

// Export the action creators
export const { registerStackable, unregisterStackable, moveToTop } = stacksSlice.actions;

// Export the reducer as default
export default stacksSlice.reducer;

// Maintain compatibility with existing code
export const actionTypes = {
	REGISTER_STACKABLE: "stacks/registerStackable",
	UNREGISTER_STACKABLE: "stacks/unregisterStackable",
	MOVE_TO_TOP: "stacks/moveToTop",
};

export const actionCreators = {
	registerStackable: (id: string, group: string = defaultGroup) =>
		registerStackable({ id, group }),
	unregisterStackable: (id: string) => unregisterStackable({ id }),
	moveToTop: (id: string) => moveToTop({ id }),
};

// Export types for use in other parts of the application
export type { StackableItem, StacksState };