import type { Metadata } from 'next';

import { CompatibilityNotice } from '~/components/get-started/CompatibilityNotice';
import { GetStartedIntro } from '~/components/get-started/GetStartedIntro';
import { WorkflowPath } from '~/components/get-started/WorkflowPath';
import { Footer } from '~/components/layout/Footer';
import { PageBackground } from '~/components/ui/PageBackground';
import { classicApps, compatibilityWarning, webApps } from '~/lib/getStarted';

export const metadata: Metadata = {
  title: 'Get Started',
  description:
    'Choose the right Network Canvas app for designing a protocol or collecting network data.',
};

const designApps = [
  ...webApps.filter((app) => app.workflow === 'design'),
  ...classicApps.filter((app) => app.workflow === 'design'),
];
const collectApps = [
  ...webApps.filter((app) => app.workflow === 'collect'),
  ...classicApps.filter((app) => app.workflow === 'collect'),
];

export default function GetStartedPage() {
  return (
    <main className="homepage-body relative isolate">
      <PageBackground />
      <div className="relative z-10">
        <GetStartedIntro />
        <WorkflowPath workflow="design" apps={designApps} />
        <WorkflowPath workflow="collect" apps={collectApps} />
        <CompatibilityNotice notice={compatibilityWarning} />
        <Footer />
      </div>
    </main>
  );
}
