import { useEffect } from 'react';
import { useSelector } from 'react-redux';

import { Layout } from '~/components/EditorLayout';
import PageHeading from '~/components/ProjectNav/PageHeading';
import useProtocolLoader from '~/hooks/useProtocolLoader';
import AssetManifest from '~/lib/ProtocolSummary/components/AssetManifest';
import Codebook from '~/lib/ProtocolSummary/components/Codebook';
import Contents from '~/lib/ProtocolSummary/components/Contents';
import Cover from '~/lib/ProtocolSummary/components/Cover';
import Stages from '~/lib/ProtocolSummary/components/Stages';
import SummaryContext from '~/lib/ProtocolSummary/components/SummaryContext';
import { getCodebookIndex } from '~/lib/ProtocolSummary/helpers';
import { getProtocol, getProtocolName } from '~/selectors/protocol';

const SummaryPage = () => {
  // Load the protocol based on URL parameters
  useProtocolLoader();

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

  // Don't render until we have protocol data
  if (!protocol || !protocolName) {
    return (
      <Layout>
        <p>Loading protocol...</p>
      </Layout>
    );
  }

  return (
    <SummaryContext.Provider
      value={{
        protocol,
        protocolName,
        index,
      }}
    >
      <Layout className="[--base-font-size:14px]">
        <div className="w-full print:hidden">
          <PageHeading
            title="Protocol Summary"
            description="Below is a comprehensive summary of your protocol configuration, including all stages, codebook, and assets."
          />
        </div>
        <div className="protocol-summary-surface">
          {/* Cover is the first marker; an explicit page break here would be
              a no-op (CSS Fragmentation: forced breaks at the start of a
              fragment are discarded) so it's omitted. */}
          <div className="page-break-marker">
            <Cover />
          </div>

          <div className="page-break-marker break-before-page">
            <Contents />
          </div>

          <div>
            <Stages />
          </div>

          <div>
            <Codebook />
          </div>

          <div>
            <AssetManifest />
          </div>
        </div>
      </Layout>
    </SummaryContext.Provider>
  );
};

export default SummaryPage;
