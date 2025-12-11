import { getAnalyticsClient } from "@codaco/analytics";
import { isAction, type Middleware } from "@reduxjs/toolkit";

/**
 * Redux middleware for tracking analytics events.
 *
 * Tracks:
 * - protocol_opened: When a protocol is successfully opened/created
 *
 * Note: Preview events are tracked directly in components since they involve
 * async operations that don't go through Redux.
 */
export const analyticsMiddleware: Middleware = () => (next) => (action) => {
	const result = next(action);

	const analytics = getAnalyticsClient();
	if (!analytics || !isAction(action)) {
		return result;
	}

	// Track protocol opened events based on fulfilled async thunk actions
	switch (action.type) {
		case "protocol/openLocalNetcanvas/fulfilled":
			analytics.trackEvent("protocol_opened", {
				metadata: { source: "file_upload" },
			});
			break;

		case "webUserActions/openRemoteNetcanvas/fulfilled":
			analytics.trackEvent("protocol_opened", {
				metadata: { source: "remote_url" },
			});
			break;

		case "webUserActions/createNetcanvas/fulfilled":
			analytics.trackEvent("protocol_opened", {
				metadata: { source: "create_new" },
			});
			break;
	}

	return result;
};
