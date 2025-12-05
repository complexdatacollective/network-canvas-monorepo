"use client";

import { createContext, type ReactNode, useEffect, useRef } from "react";
import { createAnalytics } from "./client";
import { mergeConfig } from "./config";
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
	config: AnalyticsConfig;
};

/**
 * Provider component that initializes PostHog and provides analytics context
 *
 * @example
 * ```tsx
 * import { AnalyticsProvider } from '@codaco/analytics';
 *
 * function App({ children }) {
 *   return (
 *     <AnalyticsProvider
 *       config={{
 *         installationId: 'your-installation-id',
 *         apiKey: 'phc_your_api_key', // optional if set via env
 *         apiHost: 'https://ph-relay.networkcanvas.com', // optional
 *       }}
 *     >
 *       {children}
 *     </AnalyticsProvider>
 *   );
 * }
 * ```
 */
export function AnalyticsProvider({ children, config }: AnalyticsProviderProps) {
	const analyticsRef = useRef<Analytics | null>(null);

	// Initialize analytics only once
	useEffect(() => {
		if (!analyticsRef.current) {
			const mergedConfig = mergeConfig(config);
			analyticsRef.current = createAnalytics(mergedConfig);
		}
	}, []); // Empty deps - only initialize once

	// Don't render children until analytics is initialized
	if (!analyticsRef.current) {
		return null;
	}

	return <AnalyticsContext.Provider value={analyticsRef.current}>{children}</AnalyticsContext.Provider>;
}
