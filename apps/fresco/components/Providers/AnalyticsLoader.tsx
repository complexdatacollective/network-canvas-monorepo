import { connection } from 'next/server';

import { PostHogBootstrap } from '~/components/Providers/PosthogBootstrap';
import { getDisableAnalytics, getInstallationId } from '~/queries/appSettings';

/**
 * Decides on the server whether this deployment runs analytics, and only then
 * sends the browser the component that loads PostHog.
 *
 * The decision has to happen here rather than in the browser: PostHog contacts
 * the relay the moment it initialises, so a deployment that set
 * `DISABLE_ANALYTICS` must never receive `PostHogBootstrap` at all.
 */
export default async function AnalyticsLoader() {
  // Opt this subtree out of prerendering — getDisableAnalytics and
  // getInstallationId can fall back to the database, which isn't available at
  // build time (e.g. when building the distributable Docker image). The
  // <Suspense> boundary in RootLayout lets Next stream this in at request time
  // instead.
  await connection();

  try {
    if (await getDisableAnalytics()) {
      return null;
    }

    return <PostHogBootstrap installationId={await getInstallationId()} />;
  } catch {
    // The settings couldn't be read, so we don't know whether this deployment
    // consented to analytics. Stay silent rather than assume consent.
    return null;
  }
}
