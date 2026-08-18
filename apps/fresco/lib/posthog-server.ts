// lib/posthog-server.ts
import { PostHog } from 'posthog-node';

import {
  POSTHOG_API_KEY,
  POSTHOG_APP_NAME,
  POSTHOG_PROXY_HOST,
} from '~/fresco.config';

let client: PostHog | null = null;

export function getPostHogServer() {
  client ??= new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_PROXY_HOST,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
  return client;
}

// Dynamic imports to avoid pulling Prisma (node:path, node:url, etc.)
// into Edge-compatible bundles that import this module
async function resolveInstallationId() {
  const { getInstallationId } = await import('~/queries/appSettings');
  return getInstallationId();
}

async function isAnalyticsDisabled() {
  const { getDisableAnalytics } = await import('~/queries/appSettings');
  return getDisableAnalytics();
}

export async function captureEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  // Telemetry must never throw — DB lookups for installationId/disableAnalytics
  // can fail, and a failed capture should never break the calling flow.
  try {
    if (await isAnalyticsDisabled()) return;

    const distinctId = await resolveInstallationId();
    const posthog = getPostHogServer();

    posthog.capture({
      distinctId,
      event,
      properties: {
        app: POSTHOG_APP_NAME,
        installation_id: distinctId,
        ...properties,
        $source: 'server',
      },
    });
  } catch {
    // swallow
  }
}

export async function captureException(
  error: unknown,
  properties?: Record<string, unknown>,
) {
  // Telemetry must never throw — DB lookups for installationId/disableAnalytics
  // can fail, and a failed capture should never replace the original error.
  try {
    if (await isAnalyticsDisabled()) return;

    const distinctId = await resolveInstallationId();
    const posthog = getPostHogServer();

    posthog.captureException(error, distinctId, properties);
  } catch {
    // swallow
  }
}

/**
 * Flushes anything captured so far, so it is delivered before a serverless
 * invocation freezes.
 *
 * This flushes rather than shuts the client down. One request can queue
 * several `after` callbacks — a route's own telemetry alongside activity
 * recorded by the action it called — and Next runs them concurrently against
 * this one shared client. Tearing the client down would let whichever callback
 * finished first strand another's event: the second would find `client` already
 * null, skip its own flush, and return with the event unsent. Flushing is
 * idempotent and safe to call concurrently, and the client is meant to outlive
 * a single request anyway — that is what memoizing it above is for.
 */
export async function flushPostHog() {
  // Telemetry must never throw: this runs inside `after` callbacks, where an
  // error would surface as an unhandled rejection long after the response.
  try {
    await client?.flush();
  } catch {
    // swallow
  }
}
