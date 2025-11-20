"use client";

import { useContext } from "react";
import { AnalyticsContext } from "./provider";
import type { Analytics } from "./types";

/**
 * Hook to access analytics functionality in React components
 *
 * @example
 * ```tsx
 * import { useAnalytics } from '@codaco/analytics';
 *
 * function MyComponent() {
 *   const { trackEvent, trackError } = useAnalytics();
 *
 *   const handleAction = () => {
 *     trackEvent('protocol_installed', {
 *       metadata: { protocolName: 'My Protocol' }
 *     });
 *   };
 *
 *   return <button onClick={handleAction}>Install Protocol</button>;
 * }
 * ```
 */
export function useAnalytics(): Analytics {
	const analytics = useContext(AnalyticsContext);

	if (!analytics) {
		throw new Error("useAnalytics must be used within an AnalyticsProvider");
	}

	return analytics;
}

/**
 * Hook to access feature flags
 *
 * @example
 * ```tsx
 * import { useFeatureFlag } from '@codaco/analytics';
 *
 * function MyComponent() {
 *   const isNewFeatureEnabled = useFeatureFlag('new-feature');
 *
 *   if (isNewFeatureEnabled) {
 *     return <NewFeature />;
 *   }
 *
 *   return <OldFeature />;
 * }
 * ```
 */
export function useFeatureFlag(flagKey: string): boolean {
	const analytics = useAnalytics();
	return analytics.isFeatureEnabled(flagKey) ?? false;
}

/**
 * Hook to access feature flag values (for multivariate flags)
 *
 * @example
 * ```tsx
 * import { useFeatureFlagValue } from '@codaco/analytics';
 *
 * function MyComponent() {
 *   const theme = useFeatureFlagValue('theme-variant');
 *
 *   return <div className={theme === 'dark' ? 'dark-theme' : 'light-theme'}>
 *     Content
 *   </div>;
 * }
 * ```
 */
export function useFeatureFlagValue(flagKey: string): string | boolean | undefined {
	const analytics = useAnalytics();
	return analytics.getFeatureFlag(flagKey);
}
