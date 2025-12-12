/* eslint-disable import/prefer-default-export */

import { combineReducers, type UnknownAction } from "@reduxjs/toolkit";
import { reducer as formReducer } from "redux-form";
import createTimeline from "../middleware/timeline";
import activeProtocol from "./activeProtocol";
import app from "./app";
import dialogs from "./dialogs";
import protocolMeta from "./protocolMeta";
import protocols from "./protocols";
import protocolValidation from "./protocolValidation";

const protocolPattern = /^(activeProtocol|stages|codebook|assetManifest)\//;

const timelineOptions = {
	exclude: ({ type }: UnknownAction) => !protocolPattern.test(type.toString()),
};

export const rootReducer = combineReducers({
	app,
	dialogs,
	form: formReducer,
	activeProtocol: createTimeline(activeProtocol, timelineOptions),
	protocolMeta,
	protocols,
	protocolValidation,
});

// Export the root state type
export type RootState = ReturnType<typeof rootReducer>;
