/**
 * @codaco/analytics
 *
 * PostHog analytics wrapper for Network Canvas applications
 * with installation ID tracking, error reporting, and feature flags.
 *
 * @example Client-side usage (React):
 * ```tsx
 * import { AnalyticsProvider, useAnalytics } from '@codaco/analytics';
 *
 * // In your root layout
 * export default function RootLayout({ children }) {
 *   return (
 *     <AnalyticsProvider
 *       config={{
 *         installationId: process.env.NEXT_PUBLIC_INSTALLATION_ID!,
 *       }}
 *     >
 *       {children}
 *     </AnalyticsProvider>
 *   );
 * }
 *
 * // In your components
 * function MyComponent() {
 *   const { trackEvent, trackError } = useAnalytics();
 *
 *   const handleAction = () => {
 *     trackEvent('app_setup', {
 *       metadata: { version: '1.0.0' }
 *     });
 *   };
 *
 *   return <button onClick={handleAction}>Setup</button>;
 * }
 * ```
 *
 * @example Server-side usage (API routes, server actions):
 * ```ts
 * import { serverAnalytics } from '@codaco/analytics/server';
 *
 * export async function POST(request: Request) {
 *   serverAnalytics.trackEvent('data_exported', {
 *     metadata: { format: 'csv' }
 *   });
 *
 *   // ... rest of your handler
 * }
 * ```
 */

// Re-export config helpers
export { defaultConfig, isDisabledByEnv, mergeConfig } from "./config";
export { useAnalytics, useFeatureFlag, useFeatureFlagValue } from "./hooks";

// Re-export provider and hooks for client-side usage
export { AnalyticsProvider, type AnalyticsProviderProps } from "./provider";
// Re-export types
export type {
	Analytics,
	AnalyticsConfig,
	ErrorProperties,
	EventProperties,
	EventType,
} from "./types";
export { eventTypes, legacyEventTypeMap } from "./types";

// Re-export utilities
export { ensureError } from "./utils";

// Note: Server-side exports are in a separate entry point
// Import from '@codaco/analytics/server' for server-side usage
