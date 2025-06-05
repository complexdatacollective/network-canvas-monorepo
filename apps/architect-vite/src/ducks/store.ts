import { configureStore } from "@reduxjs/toolkit";
import { rememberEnhancer, rememberReducer } from "redux-remember";
import logger from "./middleware/logger";
import { rootReducer } from "./modules/root";
import type { RootState } from "./modules/root";

// Remember both old and new stores during transition
const rememberedKeys = ["protocols", "activeProtocol", "recentProtocols", "app"];

const reducer = rememberReducer(rootReducer);

const store = configureStore({
	reducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware({
			serializableCheck: false,
			immutableCheck: {
				warnAfter: 32, // Warn after 32ms to catch performance issues
				ignorePaths: ['form', 'dialogs'], // Ignore paths with functions/non-serializable data
			},
			// thunk is included by default in RTK
		}).concat(logger),
	enhancers: (getDefaultEnhancers) =>
		getDefaultEnhancers().concat(
			rememberEnhancer(window.localStorage, rememberedKeys) as any
		),
});


export { store };

// Export types for use throughout the application
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
export type { RootState };
