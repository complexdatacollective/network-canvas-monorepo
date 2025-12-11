import { z } from "zod";

/**
 * Products that use the Network Canvas analytics system.
 * Each product is tracked as a super property on all events.
 */
export const products = ["fresco", "documentation", "architect"] as const;

export type Product = (typeof products)[number];

/**
 * Standard event properties that can be sent with any event
 */
export const EventPropertiesSchema = z.object({
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EventProperties = z.infer<typeof EventPropertiesSchema>;

/**
 * Error-specific properties for error tracking
 */
export const ErrorPropertiesSchema = EventPropertiesSchema.extend({
	message: z.string(),
	name: z.string(),
	stack: z.string().optional(),
	cause: z.string().optional(),
});

export type ErrorProperties = z.infer<typeof ErrorPropertiesSchema>;

/**
 * Analytics configuration options
 *
 * This package is designed to work exclusively with the Cloudflare Worker
 * reverse proxy at ph-relay.networkcanvas.com. All authentication is handled
 * by the worker, so the API key is optional.
 */
export type AnalyticsConfig = {
	/**
	 * The product sending analytics events.
	 * This is included with every event as a super property for filtering.
	 */
	product: Product;

	/**
	 * PostHog API host - should point to the Cloudflare Worker reverse proxy
	 * Defaults to "https://ph-relay.networkcanvas.com"
	 */
	apiHost?: string;

	/**
	 * Unique identifier for this installation/deployment (optional)
	 * This is included with every event as a super property.
	 * Required for Fresco, optional for other products.
	 */
	installationId?: string;

	/**
	 * Disable all analytics tracking
	 * Can be set via DISABLE_ANALYTICS or NEXT_PUBLIC_DISABLE_ANALYTICS env var
	 */
	disabled?: boolean;

	/**
	 * Enable debug mode for PostHog
	 */
	debug?: boolean;

	/**
	 * Enable logging of analytics events to the console.
	 * Useful for development and debugging.
	 */
	logging?: boolean;

	/**
	 * Additional options to pass to PostHog initialization
	 */
	posthogOptions?: {
		/**
		 * Disable session recording
		 */
		disable_session_recording?: boolean;

		/**
		 * Autocapture settings
		 */
		autocapture?: boolean;

		/**
		 * Capture pageviews automatically
		 */
		capture_pageview?: boolean;

		/**
		 * Capture pageleave events
		 */
		capture_pageleave?: boolean;

		/**
		 * Cross-subdomain cookie
		 */
		cross_subdomain_cookie?: boolean;

		/**
		 * Advanced feature flags support
		 */
		advanced_disable_feature_flags?: boolean;

		/**
		 * Disable compression for requests (required for proxy mode)
		 */
		disable_compression?: boolean;

		/**
		 * Other PostHog options
		 */
		[key: string]: unknown;
	};
};

/**
 * Analytics instance interface
 */
export type Analytics = {
	/**
	 * Track a custom event
	 */
	trackEvent: (eventType: string, properties?: EventProperties) => void;

	/**
	 * Track an error with full stack trace
	 */
	trackError: (error: Error, additionalProperties?: EventProperties) => void;

	/**
	 * Check if a feature flag is enabled
	 */
	isFeatureEnabled: (flagKey: string) => boolean | undefined;

	/**
	 * Get the value of a feature flag
	 */
	getFeatureFlag: (flagKey: string) => string | boolean | undefined;

	/**
	 * Reload feature flags from PostHog
	 */
	reloadFeatureFlags: () => void;

	/**
	 * Identify a user (optional - for advanced use cases)
	 * Note: By default we only track installations, not users
	 */
	identify: (distinctId: string, properties?: Record<string, unknown>) => void;

	/**
	 * Reset the user identity
	 */
	reset: () => void;

	/**
	 * Check if analytics is enabled
	 */
	isEnabled: () => boolean;

	/**
	 * Get the installation ID (if configured)
	 */
	getInstallationId: () => string | undefined;

	/**
	 * Get the product name
	 */
	getProduct: () => Product;
};
