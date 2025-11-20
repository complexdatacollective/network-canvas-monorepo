# Migration Guide: Old Analytics → PostHog

This guide will help you migrate from the old custom analytics system to the new PostHog-based implementation.

## Overview of Changes

### What's Changing

| Old System | New System |
|------------|------------|
| Custom analytics backend | PostHog Cloud (US) |
| Direct API routes (`/api/analytics`) | Cloudflare Worker reverse proxy |
| `createRouteHandler()` | `AnalyticsProvider` |
| `makeEventTracker()` | `useAnalytics()` hook |
| `AppSetup`, `ProtocolInstalled`, etc. | `app_setup`, `protocol_installed`, etc. |
| Manual IP geolocation | PostHog automatic geolocation |
| Custom dashboard (analytics-web) | PostHog dashboard |

### What's New

- **Feature Flags & A/B Testing**: Built-in support for experiments
- **Session Replay**: Optional recording of user sessions (disabled by default)
- **Better Error Tracking**: Enhanced error reporting with stack traces
- **Real-time Dashboard**: PostHog's powerful analytics interface
- **Server-side Analytics**: Dedicated API for backend tracking

## Step-by-Step Migration

### 1. Set Up Cloudflare Worker (One-Time Setup)

Deploy the reverse proxy to `ph-relay.networkcanvas.com`:

1. Follow instructions in `/cloudflare-worker/README.md`
2. Deploy the worker code from `/cloudflare-worker/posthog-proxy.js`
3. Configure custom domain: `ph-relay.networkcanvas.com`
4. Verify it's working with a test request

### 2. Update Environment Variables

**Old `.env.local`:**
```bash
# Not needed anymore - analytics was configured in code
```

**New `.env.local`:**
```bash
# Required
NEXT_PUBLIC_POSTHOG_KEY=phc_your_posthog_project_key
NEXT_PUBLIC_INSTALLATION_ID=your-unique-installation-id

# Optional (has sensible defaults)
NEXT_PUBLIC_POSTHOG_HOST=https://ph-relay.networkcanvas.com
NEXT_PUBLIC_DISABLE_ANALYTICS=false
```

### 3. Update Dependencies

The package now requires React as a peer dependency:

```bash
pnpm install @codaco/analytics@latest
```

### 4. Migrate Client-Side Code

#### Before: Route Handler + Event Tracker

```tsx
// app/api/analytics/route.ts
import { createRouteHandler } from '@codaco/analytics';

export const POST = createRouteHandler({
  installationId: process.env.INSTALLATION_ID!,
  platformUrl: 'https://analytics.networkcanvas.com',
});
```

```tsx
// components/MyComponent.tsx
import { makeEventTracker } from '@codaco/analytics';

const trackEvent = makeEventTracker();

function MyComponent() {
  const handleAction = async () => {
    await trackEvent({
      type: 'AppSetup',
      metadata: { version: '1.0.0' }
    });
  };
}
```

#### After: Provider + Hook

```tsx
// app/layout.tsx
import { AnalyticsProvider } from '@codaco/analytics';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AnalyticsProvider
      config={{
        installationId: process.env.NEXT_PUBLIC_INSTALLATION_ID!,
      }}
    >
      {children}
    </AnalyticsProvider>
  );
}
```

```tsx
// components/MyComponent.tsx
import { useAnalytics } from '@codaco/analytics';

function MyComponent() {
  const { trackEvent } = useAnalytics();

  const handleAction = () => {
    // No need to await - it's fire-and-forget
    trackEvent('app_setup', {
      metadata: { version: '1.0.0' }
    });
  };
}
```

**Key Changes:**
- Remove `/api/analytics/route.ts` - no longer needed
- Wrap app in `AnalyticsProvider`
- Use `useAnalytics()` hook instead of `makeEventTracker()`
- Event names are now `snake_case`
- No need to `await` tracking calls

### 5. Update Event Names

All event names must be converted from PascalCase to snake_case:

```typescript
// Old → New
'AppSetup'            → 'app_setup'
'ProtocolInstalled'   → 'protocol_installed'
'InterviewStarted'    → 'interview_started'
'InterviewCompleted'  → 'interview_completed'
'DataExported'        → 'data_exported'
'Error'               → 'error' (but use trackError() instead)
```

**Migration Helper:**

The package exports a `legacyEventTypeMap` for reference:

```typescript
import { legacyEventTypeMap } from '@codaco/analytics';

// Maps old names to new names
console.log(legacyEventTypeMap.AppSetup); // 'app_setup'
```

### 6. Migrate Error Tracking

#### Before:

```tsx
try {
  // code
} catch (error) {
  await trackEvent({
    type: 'Error',
    message: error.message,
    name: error.name,
    stack: error.stack,
  });
}
```

#### After:

```tsx
try {
  // code
} catch (error) {
  trackError(error as Error, {
    metadata: { context: 'import' }
  });
}
```

**Benefits:**
- Dedicated `trackError()` method
- Automatic error serialization
- Better stack trace formatting in PostHog
- Additional context via metadata

### 7. Migrate Server-Side Code

For server actions, API routes, or backend code:

#### Before:

```ts
// Not well supported in old system
```

#### After:

```ts
import { serverAnalytics } from '@codaco/analytics/server';

export async function POST(request: Request) {
  serverAnalytics.trackEvent('data_exported', {
    metadata: { format: 'csv' }
  });
}
```

### 8. Remove Old Analytics Infrastructure (Optional)

During the transition period, you can keep the old `analytics-web` app running. Once fully migrated:

1. Stop the `analytics-web` app
2. Remove or archive the app directory
3. Remove the PostgreSQL database (after backing up if needed)
4. Update any internal documentation

## Feature Comparison

### What You Gain

✅ **Feature Flags & A/B Testing**
```tsx
const { isFeatureEnabled, getFeatureFlag } = useAnalytics();

if (isFeatureEnabled('new-ui')) {
  return <NewUI />;
}
```

✅ **Better Dashboard**
- Real-time event streaming
- Funnel analysis
- Retention cohorts
- User paths
- Custom insights

✅ **Session Replay** (Optional)
```tsx
<AnalyticsProvider
  config={{
    installationId: 'xyz',
    posthogOptions: {
      disable_session_recording: false, // Enable if needed
    }
  }}
>
```

✅ **Server-Side Tracking**
```ts
import { serverAnalytics } from '@codaco/analytics/server';
```

### What You Lose

❌ **Custom Dashboard** - Use PostHog dashboard instead
❌ **Self-Hosted Backend** - Now using PostHog Cloud
❌ **Manual Geolocation Control** - PostHog handles this automatically

## Testing Your Migration

### 1. Parallel Tracking (Recommended)

During migration, track events to both systems:

```tsx
const { trackEvent: trackNewEvent } = useAnalytics();
const trackOldEvent = makeEventTracker();

const handleAction = async () => {
  // Track to both
  trackNewEvent('app_setup', { metadata: { version: '1.0.0' } });
  await trackOldEvent({ type: 'AppSetup', metadata: { version: '1.0.0' } });
};
```

### 2. Verify Events in PostHog

1. Log in to PostHog dashboard
2. Go to "Events" or "Activity"
3. Verify events are appearing with correct:
   - Event names (`app_setup`, etc.)
   - Properties (including `installation_id`)
   - Timestamps

### 3. Test Feature Flags

1. Create a test flag in PostHog
2. Use the hooks in your app:
```tsx
const isEnabled = useFeatureFlag('test-flag');
console.log('Flag enabled:', isEnabled);
```

### 4. Test Analytics Disabling

```bash
NEXT_PUBLIC_DISABLE_ANALYTICS=true pnpm dev
```

Verify no events are sent to PostHog.

## Common Migration Issues

### Issue: Events Not Appearing

**Solution:**
1. Check `NEXT_PUBLIC_POSTHOG_KEY` is set correctly
2. Verify Cloudflare Worker is deployed
3. Enable debug mode: `debug: true` in config
4. Check browser console for errors

### Issue: TypeScript Errors

**Solution:**
```bash
pnpm install @types/react --save-dev
pnpm run typecheck
```

### Issue: "useAnalytics must be used within AnalyticsProvider"

**Solution:**
Ensure `AnalyticsProvider` wraps your app in the root layout:

```tsx
// app/layout.tsx
<AnalyticsProvider config={{ ... }}>
  {children}
</AnalyticsProvider>
```

### Issue: Server-Side Analytics Not Working

**Solution:**
Ensure environment variables are set:
```bash
INSTALLATION_ID=your-id  # or NEXT_PUBLIC_INSTALLATION_ID
POSTHOG_KEY=your-key     # or NEXT_PUBLIC_POSTHOG_KEY
```

## Rollback Plan

If you need to rollback:

1. **Keep the old code** in a separate branch during migration
2. **Maintain parallel tracking** for a transition period
3. **Keep analytics-web running** until confident in migration
4. **Document any custom queries** you rely on in the old system

To rollback:

```bash
git revert <migration-commit>
pnpm install
```

Then redeploy your app.

## Migration Checklist

Use this checklist to track your migration progress:

- [ ] Deploy Cloudflare Worker reverse proxy
- [ ] Set up PostHog project and get API key
- [ ] Update `.env` files with new variables
- [ ] Install updated `@codaco/analytics` package
- [ ] Add `AnalyticsProvider` to root layout
- [ ] Update all event tracking calls to use `useAnalytics()`
- [ ] Convert all event names to `snake_case`
- [ ] Update error tracking to use `trackError()`
- [ ] Add server-side tracking where needed
- [ ] Test events appearing in PostHog dashboard
- [ ] Test analytics disabling
- [ ] Remove old `/api/analytics` route
- [ ] Update internal documentation
- [ ] (Optional) Archive/remove `analytics-web` app

## Need Help?

- Check the [main README](./README.md) for full API documentation
- Review the [PostHog documentation](https://posthog.com/docs)
- Open an issue on GitHub
- Contact: hello@complexdatacollective.org

## Next Steps

After migrating:

1. **Explore PostHog Dashboard**: Set up custom insights, funnels, and retention reports
2. **Create Feature Flags**: Start using feature flags for gradual rollouts
3. **Set Up Alerts**: Configure PostHog to alert you of anomalies
4. **Review Privacy Settings**: Ensure PostHog configuration matches your privacy requirements
5. **Archive Old Data**: Export data from the old system if needed for historical analysis
