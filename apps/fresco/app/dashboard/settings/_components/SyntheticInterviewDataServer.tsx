import { Suspense } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import SyntheticInterviewDataSection from '~/app/dashboard/settings/_components/SyntheticInterviewDataSection';
import { getServerIntl } from '~/i18n/server';
import { getProtocols } from '~/queries/protocols';
import { getSyntheticInterviewCount } from '~/queries/synthetic-interviews';

export default async function SyntheticInterviewDataServer() {
  const intl = await getServerIntl();
  const protocolsPromise = getProtocols();
  const initialCounts = await getSyntheticInterviewCount();

  return (
    <Suspense fallback={intl.formatMessage(commonMessages.loading)}>
      <SyntheticInterviewDataSection
        protocolsPromise={protocolsPromise}
        initialCounts={initialCounts}
      />
    </Suspense>
  );
}
