import { Suspense } from 'react';

import { MAX_SYNTHETIC_INTERVIEWS } from '@codaco/protocol-utilities';
import SyntheticInterviewDataSection from '~/app/dashboard/settings/_components/SyntheticInterviewDataSection';
import { getProtocols } from '~/queries/protocols';
import { getSyntheticInterviewCount } from '~/queries/synthetic-interviews';

export default async function SyntheticInterviewDataServer() {
  const protocolsPromise = getProtocols();
  const initialCounts = await getSyntheticInterviewCount();

  return (
    <Suspense fallback="Loading...">
      <SyntheticInterviewDataSection
        protocolsPromise={protocolsPromise}
        initialCounts={initialCounts}
        // Read here rather than in the client component: the ceiling is the
        // generator package's, and importing that package into a client bundle
        // would pull the whole engine across with it.
        maxInterviews={MAX_SYNTHETIC_INTERVIEWS}
      />
    </Suspense>
  );
}
