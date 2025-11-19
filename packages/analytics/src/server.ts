import { mergeConfig } from "./config";
import type { Analytics, AnalyticsConfig, ErrorProperties, EventProperties, EventType } from "./types";
import { ensureError } from "./utils";

/**
 * Server-side analytics implementation
 * This uses PostHog's API directly for server-side tracking
 */
class ServerAnalytics implements Analytics {
	private config: Required<AnalyticsConfig>;
	private disabled: boolean;

	constructor(config: AnalyticsConfig) {
		this.config = mergeConfig(config);
		this.disabled = this.config.disabled;
	}

	/**
	 * Track an event on the server-side
	 */
	trackEvent(eventType: EventType | string, properties?: EventProperties): void {
		if (this.disabled) return;

		// Send event to PostHog using fetch
		this.sendToPostHog(eventType, {
			...properties,
			...(properties?.metadata ?? {}),
		}).catch((_error) => {
			if (this.config.debug) {
			}
		});
	}

	/**
	 * Track an error on the server-side
	 */
	trackError(error: Error, additionalProperties?: EventProperties): void {
		if (this.disabled) return;

		const errorObj = ensureError(error);
		const errorProperties: ErrorProperties = {
			message: errorObj.message,
			name: errorObj.name,
			stack: errorObj.stack,
			cause: errorObj.cause ? String(errorObj.cause) : undefined,
			...additionalProperties,
		};

		this.sendToPostHog("error", {
			...errorProperties,
			...(additionalProperties?.metadata ?? {}),
		}).catch((_error) => {
			if (this.config.debug) {
			}
		});
	}

	/**
	 * Feature flags are not supported in server-side mode
	 * Use client-side hooks or PostHog API directly for feature flags
	 */
	isFeatureEnabled(_flagKey: string): boolean {
		return false;
	}

	/**
	 * Feature flags are not supported in server-side mode
	 */
	getFeatureFlag(_flagKey: string): string | boolean | undefined {
		return undefined;
	}

	/**
	 * Feature flags are not supported in server-side mode
	 */
	getFeatureFlags(): Record<string, string | boolean> {
		return {};
	}

	/**
	 * Feature flags are not supported in server-side mode
	 */
	reloadFeatureFlags(): void {}

	/**
	 * User identification on the server-side
	 */
	identify(distinctId: string, properties?: Record<string, unknown>): void {
		if (this.disabled) return;

		this.sendToPostHog("$identify", {
			$set: properties ?? {},
			distinct_id: distinctId,
		}).catch((_error) => {
			if (this.config.debug) {
			}
		});
	}

	/**
	 * Reset is not applicable on server-side
	 */
	reset(): void {}

	isEnabled(): boolean {
		return !this.disabled;
	}

	getInstallationId(): string {
		return this.config.installationId;
	}

	/**
	 * Send event to PostHog using fetch API
	 */
	private async sendToPostHog(event: string, properties: Record<string, unknown>): Promise<void> {
		if (this.disabled) return;

		const payload = {
			api_key: this.config.apiKey,
			event,
			properties: {
				...properties,
				installation_id: this.config.installationId,
			},
			timestamp: new Date().toISOString(),
		};

		try {
			const response = await fetch(`${this.config.apiHost}/capture`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				// Use keepalive for reliability
				keepalive: true,
			});

			if (!response.ok) {
				throw new Error(`PostHog API returned ${response.status}: ${response.statusText}`);
			}
		} catch (_error) {
			// Silently fail - we don't want analytics errors to break the app
			if (this.config.debug) {
			}
		}
	}
}

/**
 * Global server-side analytics instance
 */
let serverAnalyticsInstance: ServerAnalytics | null = null;

/**
 * Initialize server-side analytics
 * Call this once in your app (e.g., in a layout or middleware)
 *
 * @example
 * ```ts
 * // In your Next.js layout or API route
 * import { initServerAnalytics } from '@codaco/analytics/server';
 *
 * initServerAnalytics({
 *   installationId: process.env.INSTALLATION_ID!,
 * });
 * ```
 */
export function initServerAnalytics(config: AnalyticsConfig): void {
	if (!serverAnalyticsInstance) {
		serverAnalyticsInstance = new ServerAnalytics(config);
	}
}

/**
 * Get the server-side analytics instance
 * Use this in server components, API routes, and server actions
 *
 * @example
 * ```ts
 * import { getServerAnalytics } from '@codaco/analytics/server';
 *
 * export async function POST(request: Request) {
 *   const analytics = getServerAnalytics();
 *   analytics.trackEvent('data_exported', {
 *     metadata: { format: 'csv' }
 *   });
 *
 *   // ... rest of your handler
 * }
 * ```
 */
export function getServerAnalytics(): Analytics {
	if (!serverAnalyticsInstance) {
		throw new Error(
			"Server analytics not initialized. Call initServerAnalytics() first (e.g., in your root layout or middleware).",
		);
	}

	return serverAnalyticsInstance;
}

/**
 * Convenience export for direct usage without initialization
 * This will auto-initialize on first use with environment variables
 */
export const serverAnalytics = new Proxy({} as Analytics, {
	get(_target, prop) {
		if (!serverAnalyticsInstance) {
			// Auto-initialize with minimal config from env
			const installationId = process.env.INSTALLATION_ID || process.env.NEXT_PUBLIC_INSTALLATION_ID;

			if (!installationId) {
				throw new Error(
					"INSTALLATION_ID environment variable is required for server-side analytics. " +
						"Set INSTALLATION_ID or NEXT_PUBLIC_INSTALLATION_ID, or call initServerAnalytics() manually.",
				);
			}

			serverAnalyticsInstance = new ServerAnalytics({ installationId });
		}

		return serverAnalyticsInstance[prop as keyof Analytics];
	},
});
