import { get } from 'es-toolkit/compat';
import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { formatAssetType } from '~/components/Assets/assetMetadataMessages';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from './DualLink';
import MiniTable from './MiniTable';
import SummaryContext from './SummaryContext';
const chromeMessages = defineMessages({
  assetNotFound: {
    id: 'architect.chrome.protocolSummary.assetBadge.assetNotFound',
    defaultMessage: 'Asset {id} not found',
    description:
      'Researcher-facing explanatory text in lib / ProtocolSummary / components / AssetBadge.',
  },
});

type AssetBadgeProps = {
  id: string;
  link?: boolean;
};

type AssetData = {
  name?: string;
  type?: string;
  [key: string]: unknown;
};

const AssetBadge = ({ id, link = false }: AssetBadgeProps) => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);

  const data = get(protocol.assetManifest, id) as AssetData | undefined;

  if (!data) {
    return intl.formatMessage(chromeMessages.assetNotFound, { id: id });
  }

  const name = !link ? (
    data.name
  ) : (
    <DualLink to={`#asset-${id}`}>{data.name}</DualLink>
  );

  return (
    <MiniTable
      rotated
      rows={[
        [
          intl.formatMessage(summaryMessages.type),
          formatAssetType(data.type, intl),
        ],
        [intl.formatMessage(summaryMessages.name), name],
      ]}
    />
  );
};

export default AssetBadge;
