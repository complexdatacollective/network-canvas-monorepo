import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import AssetBrowser from '~/components/AssetBrowser';
import UnusedAssetsAlert from '~/components/AssetBrowser/UnusedAssetsAlert';
import ExternalLink from '~/components/ExternalLink';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { pageInsetClasses } from '~/components/ProjectNav/pageInset';
import { documentationLinks } from '~/utils/documentationLinks';

// Rich-text tag renderers live at module scope so they keep one identity across
// renders (an inline arrow returning JSX is a component defined during render).
const renderResourcesLink = (chunks: ReactNode[]) => (
  <ExternalLink href={documentationLinks.resources}>{chunks}</ExternalLink>
);

const additionalMessages = defineMessages({
  importExternalDataResourcesToUse: {
    id: 'architect.additional.pages.assetsPage.importExternalDataResourcesToUse',
    defaultMessage:
      'Import external data resources to use in your protocol — images, video, audio, or network data. See our <ExternalLink> documentation </ExternalLink> for more information.',
    description:
      'Introductory text under the heading of the Resource Library page. The <ExternalLink> tag wraps the words that link to the documentation about resources (uploaded files).',
  },
});
const messages = defineMessages({
  resourceLibrary: {
    id: 'architect.pages.assetsPage.resourceLibrary',
    defaultMessage: 'Resource Library',
    description:
      'Heading of the Resource Library page, where the researcher manages uploaded resource files (images, video, audio, network data) used by the protocol.',
  },
});

const AssetsPage = () => {
  const intl = useAppIntl();
  return (
    <div className={pageInsetClasses}>
      <PageHeading
        title={intl.formatMessage(messages.resourceLibrary)}
        description={
          <>
            {intl.formatMessage(
              additionalMessages.importExternalDataResourcesToUse,
              {
                ExternalLink: renderResourcesLink,
              },
            )}
          </>
        }
      />
      <div className="mx-auto my-10 w-full max-w-7xl">
        <UnusedAssetsAlert />
        <AssetBrowser />
      </div>
    </div>
  );
};

export default AssetsPage;
