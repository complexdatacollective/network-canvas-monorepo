import { configureStore } from "@reduxjs/toolkit";
import { rememberEnhancer, rememberReducer } from "redux-remember";
import thunk from "redux-thunk";
import logger from "./middleware/logger";
import { rootReducer } from "./modules/root";

const rememberedKeys = ["protocols", "recentProtocols", "app"];

const reducer = rememberReducer(rootReducer);

const store = configureStore({
	reducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware({
			serializableCheck: false,
		}).concat(thunk, logger),
	enhancers: (getDefaultEnhancers) =>
		getDefaultEnhancers().concat(rememberEnhancer(window.localStorage, rememberedKeys)),
});

export { store };
