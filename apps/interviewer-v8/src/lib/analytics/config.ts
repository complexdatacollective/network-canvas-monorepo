// PostHog configuration for Interviewer v8.
//
// These mirror the values used by the `@codaco/interview` package and the
// Fresco app so that app-level events and interview-engine events land in the
// same Codaco-managed PostHog project, behind the same proxy host. The proxy
// (https://ph-relay.networkcanvas.com) is a Cloudflare Worker that forwards to
// PostHog so the app never talks to a third-party domain directly.
export const POSTHOG_API_KEY =
  'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c';
export const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com';

// Distinct instance name so this app's posthog-js client never collides with
// the one the `@codaco/interview` Shell may lazily create for itself. We pass
// our client into the Shell explicitly, so in practice only this instance runs.
export const POSTHOG_INSTANCE_NAME = 'interviewer-v8';

// Key under which the analytics-enabled flag is mirrored into Capacitor
// Preferences (UserDefaults on iOS, SharedPreferences on Android) so the native
// crash/error SDKs can read the user's preference at launch. See
// docs/analytics.md and the native AppDelegate / Application classes.
export const NATIVE_ANALYTICS_PREF_KEY = 'analytics_enabled';
