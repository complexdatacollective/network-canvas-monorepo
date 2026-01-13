import { store } from "@app/ducks/store";
import { actionCreators as userActions } from "@modules/userActions";
import { getActiveProtocol } from "@selectors/session";
import { electronAPI } from "@utils/electronBridge";

const initFileOpener = () => {
	electronAPI.ipc.on("OPEN_FILE", (event, protocolPath) => {
		// eslint-disable-next-line no-console
		console.log(`Open file "${protocolPath}"`);
		const state = store.getState();
		const filePath = getActiveProtocol(state);

		// If the protocol is already open, no op
		if (filePath === protocolPath) {
			// eslint-disable-next-line no-console
			console.log("Already open, do nothing.");
			return;
		}

		store.dispatch(userActions.openNetcanvas(protocolPath));
	});

	electronAPI.ipc.send("READY");
};

export default initFileOpener;
