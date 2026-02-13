import { z } from "zod";

/**
 * Common event types supported by the analytics system.
 * This list is non-exhaustive — trackEvent accepts any string.
 * These are provided for discoverability and autocomplete.
 */
export const eventTypes = [
	"app_setup",
	"protocol_installed",
	"interview_started",
	"interview_completed",
	"data_exported",
	"error",
] as const;

export type EventType = (typeof eventTypes)[number];

/**
 * Legacy event type mapping for backward compatibility
 */
export const legacyEventTypeMap: Record<string, EventType> = {
	AppSetup: "app_setup",
	ProtocolInstalled: "protocol_installed",
	InterviewStarted: "interview_started",
	InterviewCompleted: "interview_completed",
	DataExported: "data_exported",
	Error: "error",
};

/**
 * Supported application identifiers.
 * Used to segment events within a single PostHog project.
 */
export const appNames = [
	"Fresco",
	"Studio",
	"Architect",
	"Interviewer",
	"ArchitectWeb",
	"CommunityForum",
	"ProjectWebsite",
	"Documentation",
] as const;

export type AppName = (typeof appNames)[number];

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
	 * Application identifier. Included with every event as a super property
	 * to segment analytics within a single PostHog project.
	 */
	app: AppName;

	/**
	 * PostHog API host - should point to the Cloudflare Worker reverse proxy
	 * Defaults to "https://ph-relay.networkcanvas.com"
	 */
	apiHost?: string;

	/**
	 * PostHog project API key (optional)
	 *
	 * When using the reverse proxy (default), authentication is handled by the
	 * Cloudflare Worker. A placeholder key will be used for client-side PostHog
	 * initialization if not provided.
	 *
	 * Only set this if you need to override the default behavior.
	 */
	apiKey?: string;

	/**
	 * Unique identifier for this installation/deployment
	 * This is included with every event as a super property
	 */
	installationId: string;

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
	trackEvent: (eventType: EventType | string, properties?: EventProperties) => void;

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
	 * Get the installation ID
	 */
	getInstallationId: () => string;
};
