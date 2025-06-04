import { createSlice } from "@reduxjs/toolkit";
import { reduce, omit } from "lodash";

const getNextIndexForGroup = (indexes, group) =>
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

const initialState = {
	// id: { index, group }
};

const stacksSlice = createSlice({
	name: 'stacks',
	initialState,
	reducers: {
		registerStackable: (state, action) => {
			const { id, group = defaultGroup } = action.payload;
			const nextIndex = getNextIndexForGroup(state, group);
			state[id] = {
				id,
				group,
				index: nextIndex,
			};
		},
		unregisterStackable: (state, action) => {
			const { id } = action.payload;
			delete state[id];
		},
		moveToTop: (state, action) => {
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

export const actionTypes = {
	REGISTER_STACKABLE: stacksSlice.actions.registerStackable.type,
	UNREGISTER_STACKABLE: stacksSlice.actions.unregisterStackable.type,
	MOVE_TO_TOP: stacksSlice.actions.moveToTop.type,
};

export const actionCreators = {
	registerStackable: (id, group = defaultGroup) => 
		stacksSlice.actions.registerStackable({ id, group }),
	unregisterStackable: (id) => 
		stacksSlice.actions.unregisterStackable({ id }),
	moveToTop: (id) => 
		stacksSlice.actions.moveToTop({ id }),
};

export default stacksSlice.reducer;
