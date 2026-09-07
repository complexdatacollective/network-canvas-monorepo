import { useEffect } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import PageHeading from '~/components/ProjectNav/PageHeading';
import AssetManifest from '~/lib/ProtocolSummary/components/AssetManifest';
import Codebook from '~/lib/ProtocolSummary/components/Codebook';
import Contents from '~/lib/ProtocolSummary/components/Contents';
import Cover from '~/lib/ProtocolSummary/components/Cover';
import Stages from '~/lib/ProtocolSummary/components/Stages';
import SummaryContext from '~/lib/ProtocolSummary/components/SummaryContext';
import { getCodebookIndex } from '~/lib/ProtocolSummary/helpers';
import { getProtocol, getProtocolName } from '~/selectors/protocol';
const messages = defineMessages({
  protocolSummary: {
    id: 'architect.pages.summaryPage.protocolSummary',
    defaultMessage: 'Protocol Summary',
    description: 'The title text in components / pages / SummaryPage.',
  },
  belowIsAComprehensiveSummaryOf: {
    id: 'architect.pages.summaryPage.belowIsAComprehensiveSummaryOf',
    defaultMessage:
      'Below is a comprehensive summary of your protocol configuration, including all stages, codebook, and assets.',
    description: 'The description text in components / pages / SummaryPage.',
  },
});

const SummaryPage = () => {
  const intl = useAppIntl();
  // Toggle a document-level class so global stylesheets can switch <html>
  // and <body> into the summary "paged" layout. The class name avoids
  // `print` because Tailwind's `print:` variant makes that token noisy to
  // grep for.
  useEffect(() => {
    document.documentElement.classList.add('summary-view');
    return () => {
      document.documentElement.classList.remove('summary-view');
    };
  }, []);
  // Get the active protocol and metadata from Redux store
  const protocol = useSelector(getProtocol);
  const protocolName = useSelector(getProtocolName);
  const index = getCodebookIndex(protocol);
  // Unreachable: ProtocolRouteGuard renders no /protocol route without a
  // protocol, which is what replaced the unbounded "Loading protocol..." state
  // this page used to sit in forever. Kept because it is the narrowing that
  // SummaryContext's non-nullable `protocol` and `protocolName` require.
  if (!protocol || protocolName === undefined) {
    return null;
  }
  return (
    <SummaryContext.Provider
      value={{
        protocol,
        protocolName,
        index,
      }}
    >
      <div className="w-full">
        <div className="w-full print:hidden">
          <PageHeading
            title={intl.formatMessage(messages.protocolSummary)}
            description={intl.formatMessage(
              messages.belowIsAComprehensiveSummaryOf,
            )}
          />
        </div>
        <div className="protocol-summary-surface mt-6 [&_.variable-pill]:origin-left [&_.variable-pill]:scale-[0.8]">
          {/* Cover is the first marker; an explicit page break here would be
            a no-op (CSS Fragmentation: forced breaks at the start of a
            fragment are discarded) so it's omitted. */}
          <div className="page-break-marker flex flex-col gap-6">
            <Cover />
          </div>

          <div className="page-break-marker flex break-before-page flex-col gap-6">
            <Contents />
          </div>

          <Stages />
          <Codebook />
          <AssetManifest />
        </div>
      </div>
    </SummaryContext.Provider>
  );
};
export default SummaryPage;
