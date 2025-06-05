/* eslint-disable import/prefer-default-export */

import { combineReducers } from "@reduxjs/toolkit";
import { reducer as formReducer } from "redux-form";
import createTimeline from "../middleware/timeline";
import app from "./app";
import dialogs from "./dialogs";
// Phase 1: Import new modules alongside old ones
import activeProtocol from "./activeProtocol";
import protocols from "./protocols";
import protocol from "./protocol";
import recentProtocols from "./recentProtocols";
import stacks from "./stacks";
import toasts from "./toasts";
import ui from "./ui/index";

const protocolPattern = /^(PROTOCOL\/|protocol\/|activeProtocol\/)/;

const timelineOptions = {
	exclude: ({ type }) => !protocolPattern.test(type.toString()),
};

export const rootReducer = combineReducers({
	app,
	dialogs,
	form: formReducer,
	// Phase 1: Keep both old and new reducers during transition
	protocol: createTimeline(protocol, timelineOptions),
	activeProtocol: createTimeline(activeProtocol, timelineOptions),
	protocols,
	recentProtocols,
	stacks,
	ui,
	toasts,
});

// Export the root state type
export type RootState = ReturnType<typeof rootReducer>;
