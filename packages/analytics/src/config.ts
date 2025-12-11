import type { AnalyticsConfig } from "./types";

/**
 * Hardcoded PostHog API host - always uses the Cloudflare Worker reverse proxy
 * Authentication is handled by the worker at this endpoint
 */
const POSTHOG_PROXY_HOST = "https://ph-relay.networkcanvas.com";

/**
 * Dummy API key used for proxy mode
 * PostHog JS library requires an API key for initialization, but when using
 * the reverse proxy, authentication is handled by the Cloudflare Worker.
 * This placeholder key is used for client-side initialization only.
 */
const PROXY_MODE_DUMMY_KEY = "phc_proxy_mode_placeholder";

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
 * Default configuration for analytics
 * API host and key are hardcoded, but disabled flag can be set via environment variables
 */
export const defaultConfig: Partial<AnalyticsConfig> = {
	// Always use the Cloudflare Worker reverse proxy
	apiHost: POSTHOG_PROXY_HOST,

	// Analytics enabled by default (can be disabled via env var or config option)
	disabled: false,

	// Debug mode disabled by default
	debug: false,

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

		// Disable compression so the proxy can inject the API key
		disable_compression: true,
	},
};

/**
 * Merged config type where all fields have defaults applied
 */
export type MergedAnalyticsConfig = Omit<Required<AnalyticsConfig>, "installationId"> & {
	installationId: string | undefined;
	apiKey: string;
	logging: boolean;
};

/**
 * Merge user config with defaults
 *
 * Note: This package is designed to work exclusively with the Cloudflare Worker
 * reverse proxy (ph-relay.networkcanvas.com). Authentication is handled by the
 * worker, so the API key is automatically set to a placeholder value.
 *
 * The only environment variable checked is DISABLE_ANALYTICS / NEXT_PUBLIC_DISABLE_ANALYTICS
 * for disabling tracking. All other configuration is hardcoded or passed explicitly.
 */
export function mergeConfig(userConfig: AnalyticsConfig): MergedAnalyticsConfig {
	return {
		product: userConfig.product,
		apiHost: userConfig.apiHost ?? defaultConfig.apiHost ?? POSTHOG_PROXY_HOST,
		apiKey: PROXY_MODE_DUMMY_KEY,
		installationId: userConfig.installationId,
		disabled: userConfig.disabled ?? isDisabledByEnv() ?? defaultConfig.disabled ?? false,
		debug: userConfig.debug ?? defaultConfig.debug ?? false,
		logging: userConfig.logging ?? false,
		posthogOptions: {
			...defaultConfig.posthogOptions,
			...userConfig.posthogOptions,
		},
	};
}
