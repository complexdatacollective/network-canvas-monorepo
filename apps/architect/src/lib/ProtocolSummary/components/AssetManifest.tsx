import { groupBy, isEmpty, map, toPairs } from 'es-toolkit/compat';
import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { formatAssetType } from '~/components/Assets/assetMetadataMessages';

import Asset from './Asset';
import SummaryContext from './SummaryContext';
const messages = defineMessages({
  resourceLibrary: {
    id: 'architect.protocolSummary.assetManifest.resourceLibrary',
    defaultMessage: 'Resource Library',
    description:
      'Visible text in lib / ProtocolSummary / components / AssetManifest.',
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
    <div className="page-break-marker flex break-before-page flex-col gap-6 [&_h2]:capitalize">
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
    </div>
  );
};
export default AssetManifest;
