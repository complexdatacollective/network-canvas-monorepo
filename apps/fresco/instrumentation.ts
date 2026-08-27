import { type Instrumentation } from 'next';

export function register() {
  // No-op for initialization
}
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  // eslint-disable-next-line no-process-env
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic imports to avoid pulling Prisma (node:path, node:url, etc.)
    // into the Edge Instrumentation bundle
    const {
      flushPostHog,
      getPostHogServer,
      getPostHogSessionProperties,
      POSTHOG_SESSION_ID_HEADER,
    } = await import('./lib/posthog-server');
    const { env } = await import('./env');
    const { POSTHOG_APP_PROPERTIES } = await import('./fresco.config');
    const { prisma } = await import('./lib/db');

    // Query the settings directly instead of using the cached queries from
    // queries/appSettings. Those use 'use cache' + cacheLife(), which isn't
    // available in the instrumentation context.
    //
    // The environment variable only forces analytics off, mirroring
    // getDisableAnalytics — an unset or false value defers to the database.
    let disableAnalytics = env.DISABLE_ANALYTICS ?? false;
    if (!disableAnalytics) {
      try {
        const setting = await prisma.appSettings.findUnique({
          where: { key: 'disableAnalytics' },
        });
        disableAnalytics = setting?.value === 'true';
      } catch {
        // Without the setting we can't tell whether this deployment consented
        // to analytics, so stay silent rather than assume consent.
        disableAnalytics = true;
      }
    }

    if (disableAnalytics) {
      return;
    }

    const posthog = getPostHogServer();

    let distinctId = env.INSTALLATION_ID;
    if (!distinctId) {
      const result = await prisma.appSettings.findUnique({
        where: { key: 'installationId' },
      });
      distinctId = result?.value ?? 'unknown';
    }

    posthog.captureException(err, distinctId, {
      ...context,
      ...getPostHogSessionProperties(
        request.headers[POSTHOG_SESSION_ID_HEADER],
      ),
      ...POSTHOG_APP_PROPERTIES,
      installation_id: distinctId,
      $source: 'server',
    });

    await flushPostHog();
  }
};
