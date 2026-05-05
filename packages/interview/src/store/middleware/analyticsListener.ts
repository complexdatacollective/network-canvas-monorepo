"use client";

import { createListenerMiddleware, type TypedStartListening } from "@reduxjs/toolkit";
import type { Tracker } from "../../analytics/tracker";
import type { AppDispatch, RootState } from "../store";

export type AnalyticsListenerArgs = {
	tracker: Tracker;
};

export function createAnalyticsListenerMiddleware({ tracker }: AnalyticsListenerArgs) {
	const analyticsListenerMiddleware = createListenerMiddleware();
	const startAppListening = analyticsListenerMiddleware.startListening as TypedStartListening<RootState, AppDispatch>;

	// Listeners (global entity, stage navigation, anonymisation) are registered
	// in subsequent tasks. The bare scaffold compiles and runs as a no-op so
	// Shell wiring works ahead of those listener implementations.
	void tracker;
	void startAppListening;

	return analyticsListenerMiddleware;
}
