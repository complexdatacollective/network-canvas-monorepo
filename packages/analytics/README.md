# @codaco/analytics

PostHog analytics wrapper for Network Canvas applications with multi-app support, installation ID tracking, error reporting, and feature flags.

## Overview

This package provides a simplified abstraction over PostHog analytics, designed for Network Canvas applications. Multiple apps (Fresco, Architect, Studio, etc.) share a single PostHog project, with events segmented by the required `app` property. Every event also includes an `installationId`, making it possible to track deployments without compromising user privacy.

**Important:** This package is designed to work exclusively with the Cloudflare Worker reverse proxy at `ph-relay.networkcanvas.com`. All PostHog authentication is handled by the worker, so you don't need to configure API keys in your application.

## Features

- **Multi-App Support**: Segment events by application within a single PostHog project
- **Installation ID Tracking**: Automatically includes installation ID with every event
- **Error Tracking**: Capture errors with full stack traces
- **Feature Flags**: Built-in support for PostHog feature flags and A/B testing
- **Non-blocking API**: All tracking calls are fire-and-forget
- **Type Safety**: Full TypeScript support with Zod schemas
- **Server & Client**: Works in React components, server actions, and API routes
- **Privacy-First**: Analytics can be completely disabled via environment variable

## Installation

```bash
pnpm add @codaco/analytics
```

## Quick Start

**Minimal environment variables!** Only `DISABLE_ANALYTICS` is supported for disabling tracking. All other configuration is passed directly to the analytics provider.

### Environment Variables (Optional)

```bash
# Optional: Disable all analytics tracking
DISABLE_ANALYTICS=true
# or for Next.js client-side
NEXT_PUBLIC_DISABLE_ANALYTICS=true
```

### Client-Side Usage

#### Pattern A: `instrumentation-client.ts` (recommended for Next.js 16+)

```ts
// instrumentation-client.ts
import { createAnalytics, mergeConfig } from "@codaco/analytics";

createAnalytics(
	mergeConfig({
		app: "Fresco",
		installationId: process.env.NEXT_PUBLIC_INSTALLATION_ID!,
	}),
);
```

#### Pattern B: React Provider (still supported)

```tsx
// app/layout.tsx
import { AnalyticsProvider } from "@codaco/analytics";

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html>
			<body>
				<AnalyticsProvider
					config={{
						app: "Fresco",
						installationId: "your-unique-installation-id",
					}}
				>
					{children}
				</AnalyticsProvider>
			</body>
		</html>
	);
}
```

```tsx
// In your components
import { useAnalytics } from "@codaco/analytics";

export function MyComponent() {
	const { trackEvent, trackError } = useAnalytics();

	const handleSetup = () => {
		trackEvent("app_setup", {
			metadata: { version: "1.0.0" },
		});
	};

	const handleError = (error: Error) => {
		trackError(error, {
			metadata: { context: "component-mount" },
		});
	};

	return <button onClick={handleSetup}>Setup App</button>;
}
```

### Server-Side Usage

#### `instrumentation.ts` (recommended for Next.js 16+)

```ts
// instrumentation.ts
export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { initServerAnalytics } = await import("@codaco/analytics/server");
		initServerAnalytics({
			app: "Fresco",
			installationId: process.env.INSTALLATION_ID!,
		});
	}
}
```

#### Direct initialization

```ts
import { initServerAnalytics } from "@codaco/analytics/server";

initServerAnalytics({
	app: "Fresco",
	installationId: "your-unique-installation-id",
});

// Then use in API routes or server actions
import { serverAnalytics } from "@codaco/analytics/server";

export async function POST(request: Request) {
	try {
		serverAnalytics.trackEvent("data_exported", {
			metadata: { format: "csv", rowCount: 100 },
		});

		return Response.json({ success: true });
	} catch (error) {
		serverAnalytics.trackError(error as Error);
		return Response.json({ error: "Failed" }, { status: 500 });
	}
}
```

## API Reference

### Config Options

```typescript
interface AnalyticsConfig {
	// Required: Application identifier for PostHog segmentation
	app: "Fresco" | "Studio" | "Architect" | "Interviewer" | "ArchitectWeb" | "CommunityForum" | "ProjectWebsite" | "Documentation";

	// Required: Unique identifier for this installation
	installationId: string;

	// Optional: PostHog API key
	// Defaults to a placeholder (authentication handled by the proxy)
	apiKey?: string;

	// Optional: PostHog API host
	// Hardcoded to "https://ph-relay.networkcanvas.com" by default
	apiHost?: string;

	// Optional: Disable all tracking
	disabled?: boolean;

	// Optional: Enable debug mode
	debug?: boolean;

	// Optional: PostHog-specific options
	posthogOptions?: {
		disable_session_recording?: boolean;
		autocapture?: boolean;
		capture_pageview?: boolean;
		// ... other PostHog options
	};
}
```

### Event Types

The package includes common event types for discoverability:

- `app_setup` - Initial application setup
- `protocol_installed` - Protocol installation
- `interview_started` - Interview start
- `interview_completed` - Interview completion
- `data_exported` - Data export
- `error` - Error events (use `trackError()` instead)

This list is non-exhaustive. `trackEvent` accepts any string as the event name.

### Client-Side API

#### `AnalyticsProvider`

Wraps your application to provide analytics context.

```tsx
<AnalyticsProvider config={config}>{children}</AnalyticsProvider>
```

#### `createAnalytics(config)`

Creates a client-side analytics instance directly. Useful for `instrumentation-client.ts`.

```ts
import { createAnalytics, mergeConfig } from "@codaco/analytics";
const analytics = createAnalytics(mergeConfig({ app: "Fresco", installationId: "..." }));
```

#### `useAnalytics()`

React hook to access analytics in components.

```tsx
const analytics = useAnalytics();
analytics.trackEvent("protocol_installed", { metadata: { protocolId: "123" } });
analytics.trackError(error, { metadata: { context: "import" } });
analytics.isFeatureEnabled("new-feature");
analytics.getFeatureFlag("experiment");
analytics.reloadFeatureFlags();
analytics.identify("user-123", { email: "user@example.com" });
analytics.reset();
analytics.isEnabled();
analytics.getInstallationId();
```

#### `useFeatureFlag(flagKey: string)`

React hook for feature flags (returns boolean).

#### `useFeatureFlagValue(flagKey: string)`

React hook for multivariate feature flags.

### Server-Side API

#### `serverAnalytics`

Pre-configured server-side analytics instance (requires `initServerAnalytics()` first).

#### `initServerAnalytics(config)`

Initialize server analytics. Call once in your app startup.

#### `getServerAnalytics()`

Get the server-side analytics instance.

**Note:** Feature flags are **not supported** in server-side mode.

## Configuration

### Default Settings

```typescript
{
  apiHost: "https://ph-relay.networkcanvas.com",
  apiKey: "phc_proxy_mode_placeholder",
  disabled: false,
  debug: false,
  posthogOptions: {
    disable_session_recording: true,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    cross_subdomain_cookie: false,
    advanced_disable_feature_flags: false,
    persistence: "localStorage+cookie",
  }
}
```

### Disabling Analytics

Analytics can be disabled via environment variable or config:

```bash
DISABLE_ANALYTICS=true
# or
NEXT_PUBLIC_DISABLE_ANALYTICS=true
```

```tsx
<AnalyticsProvider config={{ app: "Fresco", installationId: "...", disabled: true }}>
	{children}
</AnalyticsProvider>
```

## Architecture

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Fresco              │  │  Architect-Web       │  │  Studio              │
│  app: "Fresco"       │  │  app: "ArchitectWeb" │  │  app: "Studio"       │
└──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
           │                        │                        │
           └────────────┬───────────┘────────────────────────┘
                        │
                        │ HTTPS (app super property on every event)
                        ↓
           ┌─────────────────────┐
           │  Cloudflare Worker  │
           │  ph-relay.network   │
           │  canvas.com         │
           │  • Injects API key  │
           │  • Adds CORS        │
           │  • Bypasses blockers│
           └──────────┬──────────┘
                      │
                      │ HTTPS + Auth
                      ↓
           ┌─────────────────────┐
           │  PostHog Cloud      │
           │  (Single Project)   │
           │  Filter by app prop │
           └─────────────────────┘
```

## Troubleshooting

### `posthog-js` bundling issues with Turbopack

Certain `posthog-js` versions have Turbopack bundling issues when used in `instrumentation-client.ts`. If you encounter `node:child_process` errors, either pin to a compatible `posthog-js` version or fall back to the React Provider pattern.

### Events not appearing in PostHog

1. Verify the reverse proxy is running at `ph-relay.networkcanvas.com`
2. Check that the Cloudflare Worker has the `POSTHOG_API_KEY` environment variable set
3. Enable debug mode: `debug: true` in config
4. Check browser console for errors

### Feature flags not working

1. Ensure flags are created in PostHog dashboard
2. Check flag is enabled and has a rollout percentage
3. Reload flags: `analytics.reloadFeatureFlags()`
4. Feature flags only work client-side, not in server components

## Migration from v9

- `app` is a new **required** field on `AnalyticsConfig`. All consuming apps must pass it.
- `createAnalytics` is now a public export for use in `instrumentation-client.ts`.
- `AppName` and `appNames` are new exports.
- Event types are documented as non-exhaustive.

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/complexdatacollective/network-canvas-monorepo/issues
- Email: hello@complexdatacollective.org
