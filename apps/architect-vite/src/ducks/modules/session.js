import { validateProtocol } from "@codaco/protocol-validation";
import { navigate } from "wouter/use-browser-location";
import { actionCreators as timelineActions } from "~/ducks/middleware/timeline";
import { actionCreators as previewActions } from "~/ducks/modules/preview";
import { getProtocol } from "~/selectors/protocol";
import * as netcanvasFile from "~/utils/netcanvasFile";
import { validationErrorDialog } from "./userActions/dialogs";

const RESET_SESSION = "SESSION/RESET";
const PROTOCOL_CHANGED = "SESSION/PROTOCOL_CHANGED";
const OPEN_NETCANVAS = "SESSION/OPEN_NETCANVAS";
const OPEN_NETCANVAS_SUCCESS = "SESSION/OPEN_NETCANVAS_SUCCESS";
const OPEN_NETCANVAS_ERROR = "SESSION/OPEN_NETCANVAS_ERROR";
const SAVE_NETCANVAS = "SESSION/SAVE_NETCANVAS";
const SAVE_NETCANVAS_SUCCESS = "SESSION/SAVE_NETCANVAS_SUCCESS";
const SAVE_NETCANVAS_ERROR = "SESSION/SAVE_NETCANVAS_ERROR";
const SAVE_NETCANVAS_COPY = "SESSION/SAVE_NETCANVAS_COPY";
const SAVE_NETCANVAS_COPY_SUCCESS = "SESSION/SAVE_NETCANVAS_COPY_SUCCESS";
const SAVE_NETCANVAS_COPY_ERROR = "SESSION/SAVE_NETCANVAS_COPY_ERROR";

const openNetcanvas = (protocol) => async (dispatch) => {
	const result = await validateProtocol(protocol);

	if (!result.isValid) {
		dispatch(validationErrorDialog(e));
		return;
	}

	dispatch({
		type: OPEN_NETCANVAS_SUCCESS,
		payload: {
			protocol,
			protocolIsValid: result.isValid,
		},
	});
	dispatch(timelineActions.reset());
	navigate("/protocol");
};

const saveNetcanvas = () => (dispatch, getState) => {
	const state = getState();
	const { session } = state;
	const protocol = getProtocol(state);
	const { workingPath } = session;
	const { filePath } = session;

	return Promise.resolve()
		.then(() => dispatch({ type: SAVE_NETCANVAS, payload: { workingPath, filePath } }))
		.then(() => netcanvasFile.saveNetcanvas(workingPath, protocol, filePath))
		.then((savePath) => {
			dispatch({
				type: SAVE_NETCANVAS_SUCCESS,
				payload: {
					savePath,
					protocol,
				},
				ipc: true,
			});
			return savePath;
		})
		.catch((error) => {
			switch (error.code) {
				default:
					dispatch({ type: SAVE_NETCANVAS_ERROR, payload: { error, workingPath, filePath } });
			}

			throw error;
		});
};

const saveAsNetcanvas = (newFilePath) => (dispatch, getState) => {
	const state = getState();
	const { session } = state;
	const protocol = getProtocol(state);
	const { workingPath } = session;

	return (
		Promise.resolve()
			.then(() =>
				dispatch({
					type: SAVE_NETCANVAS_COPY,
					payload: { workingPath, filePath: newFilePath },
				}),
			)
			// export protocol to random temp location
			.then(() => netcanvasFile.saveNetcanvas(workingPath, protocol, newFilePath))
			.then((savePath) => {
				dispatch({ type: SAVE_NETCANVAS_COPY_SUCCESS, payload: { savePath } });
				return savePath;
			})
			.catch((error) => {
				switch (error.code) {
					default:
						dispatch({
							type: SAVE_NETCANVAS_COPY_ERROR,
							payload: { error, workingPath, filePath: newFilePath },
						});
				}

				throw error;
			})
	);
};

const resetSession = () => (dispatch) => {
	dispatch(previewActions.clearPreview());
	dispatch(previewActions.closePreview());

	dispatch({
		type: RESET_SESSION,
	});
};

// Decorate this event with the current protocol validation
// status so that we can selectively enable/disable the
// native save function.
export const protocolChanged = (protocolIsValid) => ({
	type: PROTOCOL_CHANGED,
	protocolIsValid,
});

export const checkChanged = (dispatch, getState) => {
	const protocol = getProtocol(getState());

	return validateProtocol(protocol)
		.then(() => dispatch(protocolChanged(true)))
		.catch(() => dispatch(protocolChanged(false)));
};

export const saveableChange =
	(actionCreator) =>
	(...args) =>
	(dispatch) => {
		const action = actionCreator(...args);
		const dispatchedAction = dispatch(action);

		if (dispatchedAction.then) {
			return dispatchedAction.then(() => dispatch(checkChanged));
		}

		return dispatch(checkChanged);
	};

const actionCreators = {
	resetSession,
	protocolChanged,
	saveNetcanvas,
	saveAsNetcanvas,
	openNetcanvas,
};

const actionTypes = {
	RESET_SESSION,
	PROTOCOL_CHANGED,
	OPEN_NETCANVAS,
	OPEN_NETCANVAS_SUCCESS,
	OPEN_NETCANVAS_ERROR,
	SAVE_NETCANVAS,
	SAVE_NETCANVAS_SUCCESS,
	SAVE_NETCANVAS_ERROR,
	SAVE_NETCANVAS_COPY,
	SAVE_NETCANVAS_COPY_SUCCESS,
	SAVE_NETCANVAS_COPY_ERROR,
};

export { actionCreators, actionTypes };
