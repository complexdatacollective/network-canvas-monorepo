/* eslint-disable import/prefer-default-export */

import { combineReducers } from "@reduxjs/toolkit";
import { reducer as formReducer } from "redux-form";
import createTimeline from "../middleware/timeline";
import app from "./app";
import dialogs from "./dialogs";
import protocol from "./protocol";
import recentProtocols from "./recentProtocols";
import stacks from "./stacks";
import toasts from "./toasts";
import ui from "./ui/index";

const protocolPattern = /^PROTOCOL\//;

const timelineOptions = {
	exclude: ({ type }) => !protocolPattern.test(type.toString()),
};

export const rootReducer = combineReducers({
	app,
	dialogs,
	form: formReducer,
	protocol: createTimeline(protocol, timelineOptions),
	recentProtocols,
	stacks,
	ui,
	toasts,
});

// Export the root state type
export type RootState = ReturnType<typeof rootReducer>;
