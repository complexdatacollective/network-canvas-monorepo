import { useEffect } from 'react';

import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';

import { installLegacyInterviewerInBackground } from './legacyInterviewerServiceWorker';

// Registers the bundled Interviewer 8's service worker once this app has
// rendered (see legacyInterviewerServiceWorker.ts). Rendered inside the
// analytics provider so a failure is reported, never shown.
export function LegacyInterviewerBackgroundInstall() {
  // Stable for the provider's lifetime; the install itself runs once per page
  // load whatever this effect does.
  const { captureException } = useAnalytics();

  useEffect(() => {
    void installLegacyInterviewerInBackground((error) =>
      captureException(error, { feature: 'legacy-interviewer-offline' }),
    );
  }, [captureException]);
  return null;
}
