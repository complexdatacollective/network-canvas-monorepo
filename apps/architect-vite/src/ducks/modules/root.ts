/* eslint-disable import/prefer-default-export */

import { combineReducers } from "@reduxjs/toolkit";
import { reducer as formReducer } from "redux-form";
import createTimeline from "../middleware/timeline";
import activeProtocol from "./activeProtocol";
import app from "./app";
import dialogs from "./dialogs";
import protocolValidation from "./protocolValidation";
import toasts from "./toasts";

const protocolPattern = /^(activeProtocol|stages|codebook|assetManifest)\//;

const timelineOptions = {
	exclude: ({ type }) => !protocolPattern.test(type.toString()),
};

export const rootReducer = combineReducers({
	app,
	dialogs,
	form: formReducer,
	activeProtocol: createTimeline(activeProtocol, timelineOptions),
	protocolValidation,
	toasts,
});

// Export the root state type
export type RootState = ReturnType<typeof rootReducer>;
