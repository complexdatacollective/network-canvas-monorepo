import { createAnalytics } from "./client";
import { mergeConfig } from "./config";
import type { Analytics, AnalyticsConfig } from "./types";

/**
 * Singleton analytics client for use outside of React context.
 * Useful for Redux middleware, async thunks, and other non-React code.
 *
 * @example
 * ```ts
 * // src/analytics.ts
 * import { initAnalyticsClient, getAnalyticsClient } from '@codaco/analytics';
 *
 * // Initialize once at app startup
 * export const analyticsReady = initAnalyticsClient({
 *   product: 'architect',
 * });
 *
 * // In Redux middleware or thunks
 * import { getAnalyticsClient } from '@codaco/analytics';
 *
 * const analytics = getAnalyticsClient();
 * analytics.trackEvent('protocol_opened', { metadata: { source: 'file' } });
 * ```
 */

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics> | null = null;

/**
 * Initialize the singleton analytics client.
 * Returns a promise that resolves when the client is ready.
 * Safe to call multiple times - subsequent calls return the same promise.
 */
export function initAnalyticsClient(config: AnalyticsConfig): Promise<Analytics> {
	if (initPromise) {
		return initPromise;
	}

	initPromise = new Promise((resolve) => {
		const mergedConfig = mergeConfig(config);
		analyticsInstance = createAnalytics(mergedConfig);
		resolve(analyticsInstance);
	});

	return initPromise;
}

/**
 * Get the analytics client instance.
 * Returns null if not yet initialized.
 * For async contexts, use `await initAnalyticsClient()` or check for null.
 */
export function getAnalyticsClient(): Analytics | null {
	return analyticsInstance;
}

/**
 * Get the initialization promise.
 * Useful when you need to wait for analytics to be ready.
 */
export function getAnalyticsReady(): Promise<Analytics> | null {
	return initPromise;
}

/**
 * Reset the singleton (mainly for testing).
 */
export function resetAnalyticsClient(): void {
	analyticsInstance = null;
	initPromise = null;
}
