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

/**
 * Returns the shared server-side client, constructing it on first use.
 *
 * Nothing may reach the client without first checking whether this deployment
 * has analytics enabled, and that check has to happen on every capture rather
 * than once at construction: a researcher can turn analytics off at any point,
 * and the server keeps running.
 *
 * That rule is why `enableExceptionAutocapture` is deliberately absent.
 * Enabling it makes posthog-node add `uncaughtException` and
 * `unhandledRejection` listeners to the process, and those listeners report
 * straight to the relay without consulting the setting. They are installed
 * when the client is constructed and there is no way to take them back:
 * `shutdown()` stops the exception rate limiter and leaves the listeners in
 * place, so rebuilding the client would add a second pair rather than replace
 * the first. A deployment that started with analytics enabled would therefore
 * keep sending exceptions for the life of the process after being told not to.
 *
 * The reporting this gives up is small. Errors raised while handling a request
 * reach `onRequestError`, which checks the setting; errors thrown in `after`
 * callbacks are caught and logged by Next and never reached these listeners
 * anyway. What is left is failures outside any request — a module that throws
 * at startup, a stray timer — which a self-hosted operator sees in the server
 * log.
 */
export function getPostHogServer() {
  client ??= new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_PROXY_HOST,
    flushAt: 1,
    flushInterval: 0,
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
