// Phase 1 Complete: Use new activeProtocol action types
const OPEN_PROTOCOL_SUCCESS = "SESSION/OPEN_NETCANVAS_SUCCESS";
const RESET_SESSION = "activeProtocol/clearActiveProtocol";

const OPEN_SCREEN = "UI/OPEN_SCREEN";
const UPDATE_SCREEN = "UI/UPDATE_SCREEN";
const CLOSE_SCREEN = "UI/CLOSE_SCREEN";

const initialState = {
	root: {
		screen: "start", // start or protocol,
		params: {},
	},
	screens: [
		// {
		//   screen: 'variable',
		//   params: {
		//     entity: 'node',
		//     type: 'd39a47507bbe27c2a7948861847f3607eda8s8j',
		//   },
		// },
	],
	message: {},
};

const openScreen =
	(screen, params = {}, root = false) =>
	(dispatch, getState) => {
		const state = getState();
		// Safely access timeline to prevent circular references
		const timeline = state.protocol?.timeline || [];
		const latestLocus = timeline.length > 0 ? timeline[timeline.length - 1] : null;
		const locus = params.locus || latestLocus;

		dispatch({
			type: OPEN_SCREEN,
			payload: {
				screen,
				params: {
					...params,
					locus,
				},
				root,
			},
		});
	};

const closeScreen = (screen, params = null) => ({
	type: CLOSE_SCREEN,
	payload: {
		screen,
		...(params ? { params } : {}),
	},
});

const updateScreen = (screen, params = {}) => ({
	type: UPDATE_SCREEN,
	payload: {
		screen,
		params,
	},
});

const getUpdatedScreen = (screen, params) => ({
	...screen,
	params: {
		...screen.params,
		...params,
	},
});

export default (state = initialState, { type, payload } = { type: null, payload: null }) => {
	switch (type) {
		case OPEN_PROTOCOL_SUCCESS:
		case RESET_SESSION:
			return {
				...initialState,
			};
		case OPEN_SCREEN:
			// TODO: root
			return {
				...state,
				screens: [
					...state.screens,
					{
						screen: payload.screen,
						params: { ...payload.params },
					},
				],
				message: {},
			};
		case CLOSE_SCREEN: {
			// Sanitize params to prevent circular references and functions
			const sanitizeParams = (params) => {
				if (!params || typeof params !== 'object') return params;
				try {
					// Deep clone and stringify to remove functions and circular refs
					return JSON.parse(JSON.stringify(params));
				} catch (e) {
					// If serialization fails, return null
					console.warn('Screen close params contain circular references, sanitizing:', e);
					return null;
				}
			};
			
			const message = payload.params
				? {
						...state.message,
						screen: payload.screen,
						params: sanitizeParams(payload.params),
					}
				: state.message;

			return {
				...state,
				screens: state.screens.filter(({ screen }) => screen !== payload.screen),
				message,
			};
		}
		case UPDATE_SCREEN:
			return {
				...state,
				root: state.root.screen === payload.screen ? getUpdatedScreen(state.root, payload.params) : state.root,
				screens: state.screens.map((screen) => {
					if (screen.screen !== payload.screen) {
						return screen;
					}
					return getUpdatedScreen(screen, payload.params);
				}),
			};
		default:
			return state;
	}
};

export const actionTypes = {
	OPEN_SCREEN,
	CLOSE_SCREEN,
	UPDATE_SCREEN,
};

export const actionCreators = {
	openScreen,
	closeScreen,
	updateScreen,
};
