import { configureStore } from "@reduxjs/toolkit";
import { rememberEnhancer, rememberReducer } from "redux-remember";
import logger from "./middleware/logger";
import { protocolValidationListenerMiddleware } from "./middleware/protocolValidationListener";
import type { RootState } from "./modules/root";
import { rootReducer } from "./modules/root";

// Phase 1 Complete: Only remember new stores
const rememberedKeys = ["app", "activeProtocol"];

const reducer = rememberReducer(rootReducer);

const store = configureStore({
	reducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware({
			serializableCheck: false,
			immutableCheck: {
				warnAfter: 32, // Warn after 32ms to catch performance issues
				ignorePaths: ["form", "dialogs"], // Ignore paths with functions/non-serializable data
			},
			// thunk is included by default in RTK
		})
			.concat(logger)
			.prepend(protocolValidationListenerMiddleware.middleware),
	enhancers: (getDefaultEnhancers) =>
		getDefaultEnhancers().concat(
			rememberEnhancer(window.localStorage, rememberedKeys) as unknown as ReturnType<typeof getDefaultEnhancers>[0],
		),
});

export { store };

// Export types for use throughout the application
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
export type { RootState };
