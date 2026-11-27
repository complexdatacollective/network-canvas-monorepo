import { groupBy, isEmpty, map, toPairs } from 'es-toolkit/compat';
import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { formatAssetType } from '~/components/Assets/assetMetadataMessages';

import Asset from './Asset';
import SummaryContext from './SummaryContext';
import SummaryPage from './SummaryPage';
const messages = defineMessages({
  resourceLibrary: {
    id: 'architect.protocolSummary.assetManifest.resourceLibrary',
    defaultMessage: 'Resource Library',
    description:
      'Heading of the section of the printable protocol summary that lists every uploaded resource (images, video, audio, data files, API keys) in the protocol.',
  },
});

type AssetData = {
  type?: string;
  [key: string]: unknown;
};
const AssetManifest = () => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  if (!protocol.assetManifest) {
    return null;
  }
  const assets = groupBy(
    toPairs(protocol.assetManifest),
    ([, asset]) => (asset as AssetData).type,
  );
  if (isEmpty(assets)) {
    return null;
  }
  return (
    <SummaryPage className="[&_h2]:capitalize">
      <Heading level="h1">
        {intl.formatMessage(messages.resourceLibrary)}
      </Heading>
      {assets &&
        map(assets, (typeAssets, type) => (
          <div key={type}>
            <Heading level="h2">{formatAssetType(type, intl)}</Heading>
            {typeAssets.map(([id]) => (
              <Asset id={id} key={id} />
            ))}
          </div>
        ))}
    </SummaryPage>
  );
};
export default AssetManifest;
