// PostHog configuration for Network Canvas Interviewer.
//
// The project key and relay host are shared constants: app-level events and
// interview-engine events land in the same Codaco-managed PostHog project,
// behind the same proxy host. The proxy
// (https://ph-relay.networkcanvas.com) is a Cloudflare Worker that forwards to
// PostHog so the app never talks to a third-party domain directly.
export { POSTHOG_API_KEY, POSTHOG_HOST } from '@codaco/shared-consts';

export const POSTHOG_APP_KEY = 'interviewer';
export const POSTHOG_APP_NAME = 'Interviewer';

// Distinct instance name so this app's posthog-js client never collides with
// the one the `@codaco/interview` Shell may lazily create for itself. We pass
// our client into the Shell explicitly, so in practice only this instance runs.
export const POSTHOG_INSTANCE_NAME = 'interviewer';
