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

type ActionWithMeta = UnknownAction & { meta?: { skipTimeline?: boolean } };

const timelineOptions = {
	exclude: (action: UnknownAction) =>
		!protocolPattern.test(action.type.toString()) || (action as ActionWithMeta).meta?.skipTimeline === true,
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
