# @codaco/analytics

PostHog analytics wrapper for Network Canvas applications with installation ID tracking, error reporting, and feature flags support.

## Overview

This package provides a simplified abstraction over PostHog analytics, designed specifically for Network Canvas applications. It ensures that every analytics event includes an installation ID, making it possible to track deployments without compromising user privacy.

**Important:** This package is designed to work exclusively with the Cloudflare Worker reverse proxy at `ph-relay.networkcanvas.com`. All PostHog authentication is handled by the worker, so you don't need to configure API keys in your application.

## Features

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

### Client-Side Usage (React)

```tsx
// In your root layout (app/layout.tsx)
import { AnalyticsProvider } from '@codaco/analytics';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <AnalyticsProvider
          config={{
            installationId: 'your-unique-installation-id',
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
import { useAnalytics } from '@codaco/analytics';

export function MyComponent() {
  const { trackEvent, trackError } = useAnalytics();

  const handleSetup = () => {
    trackEvent('app_setup', {
      metadata: { version: '1.0.0' }
    });
  };

  const handleError = (error: Error) => {
    trackError(error, {
      metadata: { context: 'component-mount' }
    });
  };

  return <button onClick={handleSetup}>Setup App</button>;
}
```

### Server-Side Usage

```ts
// First, initialize in your root layout or middleware
import { initServerAnalytics } from '@codaco/analytics/server';

initServerAnalytics({
  installationId: 'your-unique-installation-id',
});

// Then use in API routes or server actions
import { serverAnalytics } from '@codaco/analytics/server';

export async function POST(request: Request) {
  try {
    // Your logic here

    serverAnalytics.trackEvent('data_exported', {
      metadata: { format: 'csv', rowCount: 100 }
    });

    return Response.json({ success: true });
  } catch (error) {
    serverAnalytics.trackError(error as Error);
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
```

## API Reference

### Event Types

The package supports the following standard event types:

- `app_setup` - Initial application setup
- `protocol_installed` - Protocol installation
- `interview_started` - Interview start
- `interview_completed` - Interview completion
- `data_exported` - Data export
- `error` - Error events (use `trackError()` instead)

You can also send custom events with any string name.

### Client-Side API

#### `AnalyticsProvider`

Wraps your application to provide analytics context.

```tsx
<AnalyticsProvider config={config}>
  {children}
</AnalyticsProvider>
```

**Config Options:**

```typescript
interface AnalyticsConfig {
  // Required: Unique identifier for this installation
  installationId: string;

  // Optional: PostHog API key
  // Defaults to a placeholder (authentication handled by the proxy)
  apiKey?: string;

  // Optional: PostHog API host
  // Hardcoded to "https://ph-relay.networkcanvas.com" by default
  // Only override if using a different proxy endpoint
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

#### `useAnalytics()`

React hook to access analytics in components.

```tsx
const analytics = useAnalytics();

// Track an event
analytics.trackEvent('protocol_installed', {
  metadata: { protocolId: '123', version: '2.0' }
});

// Track an error
analytics.trackError(error, {
  metadata: { context: 'import' }
});

// Feature flags
const isEnabled = analytics.isFeatureEnabled('new-feature');
const variant = analytics.getFeatureFlag('experiment');
const allFlags = analytics.getFeatureFlags();
analytics.reloadFeatureFlags();

// User identification (optional, for advanced use cases)
analytics.identify('user-123', { email: 'user@example.com' });
analytics.reset();

// Utilities
analytics.isEnabled(); // Check if analytics is enabled
analytics.getInstallationId(); // Get the installation ID
```

#### `useFeatureFlag(flagKey: string)`

React hook for feature flags (returns boolean).

```tsx
const isNewUIEnabled = useFeatureFlag('new-ui');

if (isNewUIEnabled) {
  return <NewUI />;
}

return <OldUI />;
```

#### `useFeatureFlagValue(flagKey: string)`

React hook for multivariate feature flags.

```tsx
const theme = useFeatureFlagValue('theme-experiment');

return <div className={theme === 'dark' ? 'dark' : 'light'}>
  Content
</div>;
```

### Server-Side API

#### `serverAnalytics`

Pre-configured server-side analytics instance (auto-initializes from env vars).

```ts
import { serverAnalytics } from '@codaco/analytics/server';

serverAnalytics.trackEvent('interview_completed', {
  metadata: { duration: 300, completionRate: 0.95 }
});

serverAnalytics.trackError(error);
```

#### `initServerAnalytics(config)`

Initialize server analytics (required before using serverAnalytics).

```ts
import { initServerAnalytics, getServerAnalytics } from '@codaco/analytics/server';

// In your app startup (e.g., root layout)
initServerAnalytics({
  installationId: 'your-unique-installation-id',
  // Optional overrides:
  // disabled: false,
  // debug: true,
});

// Later, in your code
const analytics = getServerAnalytics();
analytics.trackEvent('app_setup');
```

**Note:** Feature flags are **not supported** in server-side mode. Use client-side hooks for feature flags.

## Configuration

### Default Settings

The package comes with sensible defaults (no environment variables needed):

```typescript
{
  apiHost: "https://ph-relay.networkcanvas.com", // Hardcoded
  apiKey: "phc_proxy_mode_placeholder", // Placeholder for proxy mode
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

### Configuration

All configuration is passed directly via the `config` prop.

**Environment Variables:**
- `DISABLE_ANALYTICS` or `NEXT_PUBLIC_DISABLE_ANALYTICS` - Set to `"true"` to disable all tracking

No other environment variables are used (API host and key are hardcoded for proxy mode).

### Disabling Analytics

Analytics can be disabled in two ways:

**1. Via environment variable (recommended for development/testing):**
```bash
DISABLE_ANALYTICS=true
# or for Next.js client-side
NEXT_PUBLIC_DISABLE_ANALYTICS=true
```

**2. Via config prop:**
```tsx
<AnalyticsProvider config={{
  installationId: 'your-id',
  disabled: true
}}>
  {children}
</AnalyticsProvider>
```

When disabled (by either method), all analytics methods become no-ops (no tracking occurs).

## Feature Flags & A/B Testing

PostHog feature flags allow you to:

- Toggle features on/off remotely
- Run A/B tests
- Gradual rollouts
- User targeting

### Setting Up Feature Flags

1. Create a feature flag in your PostHog dashboard
2. Use the hooks or API in your code:

```tsx
function ExperimentComponent() {
  const variant = useFeatureFlagValue('checkout-flow');

  switch (variant) {
    case 'variant-a':
      return <CheckoutFlowA />;
    case 'variant-b':
      return <CheckoutFlowB />;
    default:
      return <CheckoutFlowDefault />;
  }
}
```

## Error Tracking

Errors are automatically enriched with:

- Error message
- Error name
- Full stack trace
- Cause (if available)
- Any additional metadata you provide

```tsx
try {
  // Your code
} catch (error) {
  trackError(error as Error, {
    metadata: {
      context: 'data-import',
      fileName: 'protocol.json',
      attemptNumber: 3,
    }
  });
}
```

## Migration from Old Analytics

See [MIGRATION.md](./MIGRATION.md) for a complete migration guide from the old analytics system.

Quick summary of changes:

- **Event names**: Now use `snake_case` instead of `PascalCase`
  - `AppSetup` → `app_setup`
  - `ProtocolInstalled` → `protocol_installed`
- **API**: `makeEventTracker()` → `useAnalytics()` hook
- **Route handler**: No longer needed (PostHog handles everything)
- **Installation ID**: Now set via config instead of route handler

## Architecture

This package uses a reverse proxy architecture for security and reliability:

```
┌─────────────────────┐
│  React App          │
│  (Client)           │
│                     │
│  useAnalytics()     │
│     ↓               │
│  PostHog JS SDK     │
│  (no API key)       │
└──────────┬──────────┘
           │
           │ HTTPS
           ↓
┌─────────────────────┐
│  Cloudflare Worker  │
│  (Reverse Proxy)    │
│  ph-relay.network   │
│  canvas.com         │
│                     │
│  • Injects API key  │
│  • Adds CORS        │
│  • Bypasses blockers│
└──────────┬──────────┘
           │
           │ HTTPS + Auth
           ↓
┌─────────────────────┐
│  PostHog Cloud      │
│  (US Region)        │
│                     │
│  Analytics Dashboard│
│  Feature Flags      │
│  A/B Testing        │
└─────────────────────┘
```

**Benefits:**
- API key stays secure (server-side only)
- Avoids ad-blockers
- Uses your own domain
- Centralized authentication

## Best Practices

1. **Always include metadata**: Helps with debugging and analysis
   ```ts
   trackEvent('data_exported', {
     metadata: { format: 'csv', size: 1024, duration: 230 }
   });
   ```

2. **Use typed event names**: Import event types for autocomplete
   ```ts
   import type { EventType } from '@codaco/analytics';
   const event: EventType = 'app_setup';
   ```

3. **Don't block on analytics**: All calls are non-blocking by design

4. **Test with analytics disabled**: Set `NEXT_PUBLIC_DISABLE_ANALYTICS=true`

5. **Use feature flags for gradual rollouts**: Test features with a small percentage of users first

## Troubleshooting

### Events not appearing in PostHog

1. Verify the reverse proxy is running at `ph-relay.networkcanvas.com`
2. Check that the Cloudflare Worker has the `POSTHOG_API_KEY` environment variable set
3. Enable debug mode: `debug: true` in config
4. Check browser console for errors
5. Verify PostHog dashboard shows your project
6. Test the proxy endpoint directly: `curl https://ph-relay.networkcanvas.com`

### Feature flags not working

1. Ensure flags are created in PostHog dashboard
2. Check flag is enabled and has a rollout percentage
3. Reload flags: `analytics.reloadFeatureFlags()`
4. Feature flags only work client-side, not in server components

### TypeScript errors

1. Ensure `@types/react` is installed
2. Check TypeScript version is compatible (>= 5.0)
3. Rebuild the package: `pnpm build`

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/complexdatacollective/network-canvas-monorepo/issues
- Email: hello@complexdatacollective.org
