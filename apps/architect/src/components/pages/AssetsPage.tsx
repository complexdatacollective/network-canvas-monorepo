import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import AssetBrowser from '~/components/AssetBrowser';
import UnusedAssetsAlert from '~/components/AssetBrowser/UnusedAssetsAlert';
import ExternalLink from '~/components/ExternalLink';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { documentationLinks } from '~/utils/documentationLinks';
const additionalMessages = defineMessages({
  importExternalDataResourcesToUse: {
    id: 'architect.additional.pages.assetsPage.importExternalDataResourcesToUse',
    defaultMessage:
      'Import external data resources to use in your protocol — images, video, audio, or network data. See our <ExternalLink> documentation </ExternalLink> for more information.',
    description: 'Visible text in components / pages / AssetsPage.',
  },
});
const messages = defineMessages({
  resourceLibrary: {
    id: 'architect.pages.assetsPage.resourceLibrary',
    defaultMessage: 'Resource Library',
    description: 'The title text in components / pages / AssetsPage.',
  },
});

const AssetsPage = () => {
  const intl = useAppIntl();
  return (
    <div className="phone-landscape:px-7 tablet-landscape:px-29 px-5">
      <PageHeading
        title={intl.formatMessage(messages.resourceLibrary)}
        description={
          <>
            {intl.formatMessage(
              additionalMessages.importExternalDataResourcesToUse,
              {
                ExternalLink: (chunks) => (
                  <ExternalLink href={documentationLinks.resources}>
                    {chunks}
                  </ExternalLink>
                ),
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
