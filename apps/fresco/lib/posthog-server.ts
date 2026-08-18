// lib/posthog-server.ts
import { PostHog } from 'posthog-node';

import {
  POSTHOG_API_KEY,
  POSTHOG_APP_PROPERTIES,
  POSTHOG_PROXY_HOST,
} from '~/fresco.config';

let client: PostHog | null = null;

export const POSTHOG_SESSION_ID_HEADER = 'x-posthog-session-id';

const TRACING_HEADER_MAX_LENGTH = 1000;
// Remove C0 controls, DEL, and C1 controls from tracing IDs received from the
// browser before adding them to server-side events.
// eslint-disable-next-line no-control-regex
const TRACING_HEADER_CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f-\x9f]/g;

export function getPostHogSessionProperties(
  value: string | string[] | null | undefined,
): { $session_id?: string } {
  const values = Array.isArray(value) ? value : [value];

  for (const candidate of values) {
    if (typeof candidate !== 'string') continue;

    const sessionId = candidate
      .replace(TRACING_HEADER_CONTROL_CHARS_REGEX, '')
      .trim()
      .slice(0, TRACING_HEADER_MAX_LENGTH);

    if (sessionId) return { $session_id: sessionId };
  }

  return {};
}

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

async function resolveBrowserSessionProperties() {
  try {
    const { headers } = await import('next/headers');
    const requestHeaders = await headers();
    return getPostHogSessionProperties(
      requestHeaders.get(POSTHOG_SESSION_ID_HEADER),
    );
  } catch {
    // Captures outside a request context have no browser session to correlate.
    return {};
  }
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
    const browserSessionProperties = await resolveBrowserSessionProperties();
    const posthog = getPostHogServer();

    posthog.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        ...browserSessionProperties,
        ...POSTHOG_APP_PROPERTIES,
        installation_id: distinctId,
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
    const browserSessionProperties = await resolveBrowserSessionProperties();
    const posthog = getPostHogServer();

    posthog.captureException(error, distinctId, {
      ...properties,
      ...browserSessionProperties,
      ...POSTHOG_APP_PROPERTIES,
      installation_id: distinctId,
      $source: 'server',
    });
  } catch {
    // swallow
  }
}

export async function shutdownPostHog() {
  if (client) {
    await client.shutdown();
    client = null;
  }
}
