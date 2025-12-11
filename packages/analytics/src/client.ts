import posthog from "posthog-js";
import type { MergedAnalyticsConfig } from "./config";
import { logDisabled, logError, logEvent, logInit } from "./logger";
import type { Analytics, ErrorProperties, EventProperties, Product } from "./types";
import { ensureError } from "./utils";

/**
 * Create a client-side analytics instance
 * This wraps PostHog with Network Canvas-specific functionality
 */
export function createAnalytics(config: MergedAnalyticsConfig): Analytics {
	const { apiHost, apiKey, product, installationId, disabled, debug, logging, posthogOptions } = config;

	// If analytics is disabled, return a no-op implementation
	if (disabled) {
		if (logging) {
			logDisabled("config");
		}
		return createNoOpAnalytics(product, installationId, logging);
	}

	// Initialize PostHog
	posthog.init(apiKey, {
		api_host: apiHost,
		loaded: (posthogInstance) => {
			// Build super properties object
			const superProperties: Record<string, string> = {
				product,
			};

			// Only include installation_id if provided
			if (installationId) {
				superProperties.installation_id = installationId;
			}

			// Register super properties (included with every event)
			posthogInstance.register(superProperties);

			if (debug) {
				posthogInstance.debug();
			}

			if (logging) {
				logInit(product, installationId);
			}
		},
		...posthogOptions,
	});

	return {
		trackEvent: (eventType: string, properties?: EventProperties) => {
			if (disabled) return;

			if (logging) {
				logEvent(eventType, properties);
			}

			try {
				posthog.capture(eventType, {
					...properties,
					// Flatten metadata into properties for better PostHog integration
					...(properties?.metadata ?? {}),
				});
			} catch (_e) {
				// Silently fail - analytics errors shouldn't break the app
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

				if (logging) {
					logError(errorProperties);
				}

				posthog.capture("error", {
					...errorProperties,
					// Flatten metadata
					...(additionalProperties?.metadata ?? {}),
				});
			} catch (_e) {
				// Silently fail - analytics errors shouldn't break the app
			}
		},

		isFeatureEnabled: (flagKey: string) => {
			if (disabled) return false;

			try {
				return posthog.isFeatureEnabled(flagKey);
			} catch (_e) {
				return undefined;
			}
		},

		getFeatureFlag: (flagKey: string) => {
			if (disabled) return undefined;

			try {
				return posthog.getFeatureFlag(flagKey);
			} catch (_e) {
				return undefined;
			}
		},

		reloadFeatureFlags: () => {
			if (disabled) return;

			try {
				posthog.reloadFeatureFlags();
			} catch (_e) {
				// Silently fail
			}
		},

		identify: (distinctId: string, properties?: Record<string, unknown>) => {
			if (disabled) return;

			try {
				posthog.identify(distinctId, properties);
			} catch (_e) {
				// Silently fail
			}
		},

		reset: () => {
			if (disabled) return;

			try {
				posthog.reset();
			} catch (_e) {
				// Silently fail
			}
		},

		isEnabled: () => !disabled,

		getInstallationId: () => installationId,

		getProduct: () => product,
	};
}

/**
 * Create a no-op analytics instance when analytics is disabled
 */
function createNoOpAnalytics(product: Product, installationId: string | undefined, logging: boolean): Analytics {
	return {
		trackEvent: (eventType: string, properties?: EventProperties) => {
			if (logging) {
				logEvent(eventType, properties);
			}
		},
		trackError: (error: Error, additionalProperties?: EventProperties) => {
			if (logging) {
				const errorObj = ensureError(error);
				logError({
					message: errorObj.message,
					name: errorObj.name,
					stack: errorObj.stack,
					cause: errorObj.cause ? String(errorObj.cause) : undefined,
					...additionalProperties,
				});
			}
		},
		isFeatureEnabled: () => false,
		getFeatureFlag: () => undefined,
		reloadFeatureFlags: () => {},
		identify: () => {},
		reset: () => {},
		isEnabled: () => false,
		getInstallationId: () => installationId,
		getProduct: () => product,
	};
}
