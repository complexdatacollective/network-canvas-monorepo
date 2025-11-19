import posthog from "posthog-js";
import type { Analytics, AnalyticsConfig, ErrorProperties, EventProperties, EventType } from "./types";
import { ensureError } from "./utils";

/**
 * Create a client-side analytics instance
 * This wraps PostHog with Network Canvas-specific functionality
 */
export function createAnalytics(config: Required<AnalyticsConfig>): Analytics {
	const { apiHost, apiKey, installationId, disabled, debug, posthogOptions } = config;

	// If analytics is disabled, return a no-op implementation
	if (disabled) {
		return createNoOpAnalytics(installationId);
	}

	// Initialize PostHog
	posthog.init(apiKey, {
		api_host: apiHost,
		loaded: (posthogInstance) => {
			// Set installation ID as a super property (included with every event)
			posthogInstance.register({
				installation_id: installationId,
			});

			if (debug) {
				posthogInstance.debug();
			}
		},
		...posthogOptions,
	});

	return {
		trackEvent: (eventType: EventType | string, properties?: EventProperties) => {
			if (disabled) return;

			try {
				posthog.capture(eventType, {
					...properties,
					// Flatten metadata into properties for better PostHog integration
					...(properties?.metadata ?? {}),
				});
			} catch (_e) {
				if (debug) {
				}
			}
		},

		trackError: (error: Error, additionalProperties?: EventProperties) => {
			if (disabled) return;

			try {
				const errorObj = ensureError(error);
				const errorProperties: ErrorProperties = {
					message: errorObj.message,
					name: errorObj.name,
					stack: errorObj.stack,
					cause: errorObj.cause ? String(errorObj.cause) : undefined,
					...additionalProperties,
				};

				posthog.capture("error", {
					...errorProperties,
					// Flatten metadata
					...(additionalProperties?.metadata ?? {}),
				});
			} catch (_e) {
				if (debug) {
				}
			}
		},

		isFeatureEnabled: (flagKey: string) => {
			if (disabled) return false;

			try {
				return posthog.isFeatureEnabled(flagKey);
			} catch (_e) {
				if (debug) {
				}
				return undefined;
			}
		},

		getFeatureFlag: (flagKey: string) => {
			if (disabled) return undefined;

			try {
				return posthog.getFeatureFlag(flagKey);
			} catch (_e) {
				if (debug) {
				}
				return undefined;
			}
		},

		getFeatureFlags: () => {
			if (disabled) return {};

			try {
				return posthog.getFeatureFlags() as Record<string, string | boolean>;
			} catch (_e) {
				if (debug) {
				}
				return {};
			}
		},

		reloadFeatureFlags: () => {
			if (disabled) return;

			try {
				posthog.reloadFeatureFlags();
			} catch (_e) {
				if (debug) {
				}
			}
		},

		identify: (distinctId: string, properties?: Record<string, unknown>) => {
			if (disabled) return;

			try {
				posthog.identify(distinctId, properties);
			} catch (_e) {
				if (debug) {
				}
			}
		},

		reset: () => {
			if (disabled) return;

			try {
				posthog.reset();
			} catch (_e) {
				if (debug) {
				}
			}
		},

		isEnabled: () => !disabled,

		getInstallationId: () => installationId,
	};
}

/**
 * Create a no-op analytics instance when analytics is disabled
 */
function createNoOpAnalytics(installationId: string): Analytics {
	return {
		trackEvent: () => {},
		trackError: () => {},
		isFeatureEnabled: () => false,
		getFeatureFlag: () => undefined,
		getFeatureFlags: () => ({}),
		reloadFeatureFlags: () => {},
		identify: () => {},
		reset: () => {},
		isEnabled: () => false,
		getInstallationId: () => installationId,
	};
}
