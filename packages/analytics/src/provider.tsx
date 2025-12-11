"use client";

import { createContext, type ReactNode, useEffect, useState } from "react";
import { getAnalyticsClient, getAnalyticsReady, initAnalyticsClient } from "./singleton";
import type { Analytics, AnalyticsConfig } from "./types";

/**
 * React Context for analytics
 */
export const AnalyticsContext = createContext<Analytics | null>(null);

/**
 * Props for the AnalyticsProvider
 */
export type AnalyticsProviderProps = {
	children: ReactNode;
	/**
	 * Analytics configuration. Used to initialize the client if not already initialized.
	 */
	config: AnalyticsConfig;
};

/**
 * Provider component that initializes PostHog and provides analytics context.
 *
 * Uses the singleton analytics client, which can also be accessed outside React
 * via `getAnalyticsClient()` for use in Redux middleware or async thunks.
 *
 * @example
 * ```tsx
 * import { AnalyticsProvider } from '@codaco/analytics';
 *
 * function App({ children }) {
 *   return (
 *     <AnalyticsProvider
 *       config={{
 *         product: 'architect',
 *       }}
 *     >
 *       {children}
 *     </AnalyticsProvider>
 *   );
 * }
 * ```
 */
export function AnalyticsProvider({ children, config }: AnalyticsProviderProps) {
	const [analytics, setAnalytics] = useState<Analytics | null>(() => getAnalyticsClient());

	useEffect(() => {
		// Check if already initialized
		const existingClient = getAnalyticsClient();
		if (existingClient) {
			setAnalytics(existingClient);
			return;
		}

		// Check if initialization is in progress
		const readyPromise = getAnalyticsReady();
		if (readyPromise) {
			readyPromise.then(setAnalytics);
			return;
		}

		// Initialize the client
		initAnalyticsClient(config).then(setAnalytics);
	}, []); // Empty deps - only initialize once

	// Don't render children until analytics is initialized
	if (!analytics) {
		return null;
	}

	return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}
