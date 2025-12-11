/**
 * @codaco/analytics
 *
 * PostHog analytics wrapper for Network Canvas applications
 * with product tracking, optional installation ID, error reporting, and feature flags.
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
 *         product: 'architect',
 *         // installationId is optional for most products (required for Fresco)
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
 * import { initServerAnalytics, serverAnalytics } from '@codaco/analytics/server';
 *
 * // Initialize once in your app
 * initServerAnalytics({ product: 'fresco', installationId: '...' });
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
export { AnalyticsContext, AnalyticsProvider, type AnalyticsProviderProps } from "./provider";

// Re-export singleton for use outside React (Redux middleware, async thunks, etc.)
export { getAnalyticsClient, getAnalyticsReady, initAnalyticsClient, resetAnalyticsClient } from "./singleton";

// Re-export types
export type { Analytics, AnalyticsConfig, ErrorProperties, EventProperties, Product } from "./types";
export { products } from "./types";

// Re-export utilities
export { ensureError } from "./utils";

// Note: Server-side exports are in a separate entry point
// Import from '@codaco/analytics/server' for server-side usage
