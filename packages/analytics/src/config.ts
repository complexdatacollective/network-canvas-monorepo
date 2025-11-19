import type { AnalyticsConfig } from "./types";

/**
 * Default configuration for analytics
 * These can be overridden by environment variables or passed directly
 */
export const defaultConfig: Partial<AnalyticsConfig> = {
	// Use the Cloudflare Worker reverse proxy by default
	apiHost: "https://ph-relay.networkcanvas.com",

	// Disable analytics by default if env var is set
	disabled:
		typeof process !== "undefined"
			? process.env.DISABLE_ANALYTICS === "true" || process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === "true"
			: false,

	// Debug mode based on environment
	debug: typeof process !== "undefined" ? process.env.NODE_ENV === "development" : false,

	// Default PostHog options
	posthogOptions: {
		// Disable session recording by default (can be enabled per-app)
		disable_session_recording: true,

		// Disable autocapture to keep events clean and intentional
		autocapture: false,

		// Disable automatic pageview capture (apps can enable if needed)
		capture_pageview: false,

		// Disable pageleave events
		capture_pageleave: false,

		// Don't use cross-subdomain cookies
		cross_subdomain_cookie: false,

		// Enable feature flags by default
		advanced_disable_feature_flags: false,

		// Send feature flag events
		advanced_disable_feature_flags_on_first_load: false,

		// Enable persistence for feature flags
		persistence: "localStorage+cookie",
	},
};

/**
 * Get the PostHog API key from environment variables
 */
export function getApiKeyFromEnv(): string | undefined {
	if (typeof process === "undefined") {
		return undefined;
	}

	return process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.POSTHOG_KEY;
}

/**
 * Get the PostHog API host from environment variables
 */
export function getApiHostFromEnv(): string | undefined {
	if (typeof process === "undefined") {
		return undefined;
	}

	return process.env.NEXT_PUBLIC_POSTHOG_HOST || process.env.POSTHOG_HOST;
}

/**
 * Check if analytics is disabled via environment variables
 */
export function isDisabledByEnv(): boolean {
	if (typeof process === "undefined") {
		return false;
	}

	return process.env.DISABLE_ANALYTICS === "true" || process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === "true";
}

/**
 * Merge user config with defaults and environment variables
 */
export function mergeConfig(userConfig: AnalyticsConfig): Required<AnalyticsConfig> {
	const apiKey = userConfig.apiKey ?? getApiKeyFromEnv();

	if (!apiKey) {
		throw new Error(
			"PostHog API key is required. Set NEXT_PUBLIC_POSTHOG_KEY environment variable or pass apiKey to AnalyticsProvider.",
		);
	}

	return {
		apiHost: userConfig.apiHost ?? getApiHostFromEnv() ?? defaultConfig.apiHost ?? "https://ph-relay.networkcanvas.com",
		apiKey,
		installationId: userConfig.installationId,
		disabled: userConfig.disabled ?? isDisabledByEnv() ?? defaultConfig.disabled ?? false,
		debug: userConfig.debug ?? defaultConfig.debug ?? false,
		posthogOptions: {
			...defaultConfig.posthogOptions,
			...userConfig.posthogOptions,
		},
	};
}
