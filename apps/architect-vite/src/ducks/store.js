import { configureStore } from "@reduxjs/toolkit";
import thunk from "redux-thunk";
import logger from "./middleware/logger";
import { rootReducer } from "./modules/root";

const store = configureStore({
	reducer: rootReducer,
	middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(thunk, logger),
});

export { store };
