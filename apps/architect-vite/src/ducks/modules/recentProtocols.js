import { uniqBy } from "es-toolkit/compat";
import { actionTypes as sessionActionTypes } from "~/ducks/modules/session";

const initialState = [];

const addProtocol = (state, protocol) =>
	uniqBy([protocol, ...state], "filePath")
		.sort((a, b) => b.lastModified - a.lastModified)
		.slice(0, 50);

export default function reducer(state = initialState, action = {}) {
	switch (action.type) {
		case sessionActionTypes.OPEN_NETCANVAS_ERROR:
			return state.filter((protocol) => protocol.filePath !== action.payload.filePath);
		case sessionActionTypes.OPEN_NETCANVAS_SUCCESS: {
			const { protocol } = action.payload;
			return addProtocol(state, {
				protocol,
				lastModified: protocol.lastModified,
				name: "TEST",
				description: protocol.description,
				schemaVersion: protocol.schemaVersion,
			});
		}
		default:
			return state;
	}
}

const actionCreators = {};

const actionTypes = {};

export { actionCreators, actionTypes };
