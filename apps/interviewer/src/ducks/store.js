/* eslint-disable @codaco/spellcheck/spell-checker */

import { routerMiddleware } from "connected-react-router";
import { createHashHistory as createHistory } from "history";
import { applyMiddleware, compose, createStore } from "redux";
import { persistReducer, persistStore } from "redux-persist";
import autoMergeLevel2 from "redux-persist/lib/stateReconciler/autoMergeLevel2";
import thunk from "redux-thunk";
import { getEnv, isCordova } from "../utils/Environment";
import { localStorageEngine, sqliteStorageEngine } from "../utils/storageAdapters";
import logger from "./middleware/logger";
import sound from "./middleware/sound";
import createRootReducer from "./modules/rootReducer";

// eslint-disable-next-line import/no-mutable-exports
let persistor;

const getStorageEngine = () => {
	const onPersistReady = () => {
		persistor.persist();
	};

	if (isCordova()) {
		return sqliteStorageEngine(onPersistReady);
	}

	return localStorageEngine(onPersistReady);
};

const persistConfig = {
	key: "networkCanvas6",
	autoMergeLevel2,
	storage: getStorageEngine(),
	whitelist: [
		"deviceSettings",
		"installedProtocols",
		"router",
		"search",
		"activeSessionId",
		"sessions",
		"dismissedUpdates",
	],
};

const env = getEnv();

export const history = createHistory();

const getReducer = () => {
	if (env.REACT_APP_NO_PERSIST) {
		return createRootReducer(history);
	}
	return persistReducer(persistConfig, createRootReducer(history));
};

export const store = createStore(
	getReducer(),
	undefined,
	compose(
		applyMiddleware(routerMiddleware(history), thunk, logger, sound),
		typeof window === "object" && typeof window.devToolsExtension !== "undefined"
			? window.devToolsExtension()
			: (f) => f,
	),
);

persistor = persistStore(store, { manualPersist: true });

export { persistor };
