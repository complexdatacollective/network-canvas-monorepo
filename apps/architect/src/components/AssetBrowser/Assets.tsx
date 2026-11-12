import { useCallback, useMemo } from 'react';
import { compose } from 'react-recompose';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { GridLayout } from '@codaco/fresco-ui/collection/layout/GridLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';

import AssetCard from './AssetCard';
import { useUnresolvedAssetIds } from './useUnresolvedAssets';
import withAssets from './withAssets';
const configMessages = defineMessages({
  all: {
    id: 'architect.assetBrowser.assets.config.all',
    defaultMessage: 'All',
    description:
      'Option in the filter switcher above the resource library that shows resources of every kind.',
  },
  image: {
    id: 'architect.assetBrowser.assets.config.image',
    defaultMessage: 'Image',
    description:
      'Option in the filter switcher above the resource library that shows only image resources. Names the kind of file.',
  },
  video: {
    id: 'architect.assetBrowser.assets.config.video',
    defaultMessage: 'Video',
    description:
      'Option in the filter switcher above the resource library that shows only video resources. Names the kind of file.',
  },
  audio: {
    id: 'architect.assetBrowser.assets.config.audio',
    defaultMessage: 'Audio',
    description:
      'Option in the filter switcher above the resource library that shows only audio resources. Names the kind of file.',
  },
  network: {
    id: 'architect.assetBrowser.assets.config.network',
    defaultMessage: 'Network',
    description:
      'Option in the filter switcher above the resource library that shows only network data resources (a file of nodes or edges, such as CSV or JSON). Names the kind of file.',
  },
  geoJSON: {
    id: 'architect.assetBrowser.assets.config.geoJSON',
    defaultMessage: 'GeoJSON',
    description:
      'Option in the filter switcher above the resource library that shows only GeoJSON map data resources. GeoJSON is a file format name.',
  },
  aPIKey: {
    id: 'architect.assetBrowser.assets.config.aPIKey',
    defaultMessage: 'API key',
    description:
      'Option in the filter switcher above the resource library that shows only API key resources (for example a map service key).',
  },
});
const messages = defineMessages({
  filterResourcesByType: {
    id: 'architect.assetBrowser.assets.filterResourcesByType',
    defaultMessage: 'Filter resources by type',
    description:
      'Accessible name of the switcher above the resource library that filters resources by kind; read only by screen readers.',
  },
  resourceLibrary: {
    id: 'architect.assetBrowser.assets.resourceLibrary',
    defaultMessage: 'Resource library',
    description:
      'Accessible name of the grid of resource cards in the resource library; read only by screen readers.',
  },
  noResourcesToDisplay: {
    id: 'architect.assetBrowser.assets.noResourcesToDisplay',
    defaultMessage: 'No resources to display.',
    description:
      'Message shown in place of the resource cards when no resources match the selected filter or the protocol has none.',
  },
});

type AssetTypeValue =
  | 'image'
  | 'video'
  | 'audio'
  | 'network'
  | 'apikey'
  | 'geojson';

type AssetFilterValue = 'all' | AssetTypeValue;

const ASSET_TYPES: MessageConfig<SegmentedOption<AssetFilterValue>>[] = [
  { label: configMessages.all, value: 'all' },
  { label: configMessages.image, value: 'image' },
  { label: configMessages.video, value: 'video' },
  { label: configMessages.audio, value: 'audio' },
  { label: configMessages.network, value: 'network' },
  { label: configMessages.geoJSON, value: 'geojson' },
  { label: configMessages.aPIKey, value: 'apikey' },
];

type AssetType = {
  id: string;
  isUsed: boolean;
  name: string;
  source?: string;
  type: AssetTypeValue;
};

const assetName = (asset: AssetType) => asset.name;

type AssetsProps = {
  type?: string | null;
  assets?: AssetType[];
  assetType?: string | null;
  onUpdateAssetFilter: (value: string | null) => void;
  onSelect?: (id: string) => void;
  onDelete?: ((id: string, isUsed: boolean) => void) | null;
  onDownload?: (id: string) => void;
  onPreview?: (id: string) => void;
  onReplace?: (id: string) => void;
  disableDelete?: boolean;
  selected?: string | null;
};

const Assets = ({
  type = null,
  assets = [],
  assetType = null,
  onUpdateAssetFilter,
  onSelect,
  onDelete = null,
  onDownload,
  onPreview,
  onReplace,
  disableDelete = false,
  selected = null,
}: AssetsProps) => {
  const intl = useAppIntl();
  const unresolvedAssetIds = useUnresolvedAssetIds();
  const readOnly = useProtocolReadOnly();
  const handleDelete = disableDelete ? null : onDelete;
  const selectedAssetType: AssetFilterValue =
    ASSET_TYPES.find(({ value }) => value === assetType)?.value ?? 'all';

  const layout = useMemo(
    () => new GridLayout<AssetType>({ minItemWidth: 280, gap: 5 }),
    [],
  );

  const handleAssetTypeChange = useCallback(
    (value: AssetFilterValue) => {
      onUpdateAssetFilter(value === 'all' ? null : value);
    },
    [onUpdateAssetFilter],
  );

  const handleSelectionChange = useCallback(
    (keys: Set<Key>) => {
      const [selectedKey] = [...keys];
      if (typeof selectedKey !== 'string') return;

      if (onSelect) {
        onSelect(selectedKey);
        return;
      }

      // Activating the card is a second route to Preview, so hiding the button
      // is not enough: it would open a preview of bytes that are known not to
      // exist, with a download that cannot work. Send the researcher to the
      // one action that resolves it instead. Read-only, that action is
      // unavailable and there is nothing else to open, so activating does
      // nothing.
      if (unresolvedAssetIds.has(selectedKey)) {
        if (!readOnly) onReplace?.(selectedKey);
        return;
      }

      onPreview?.(selectedKey);
    },
    [onPreview, onReplace, onSelect, readOnly, unresolvedAssetIds],
  );

  const renderItem = useCallback(
    (asset: AssetType, itemProps: ItemProps) => (
      <AssetCard
        id={asset.id}
        isCurrent={asset.id === selected}
        name={asset.name}
        source={asset.source}
        type={asset.type}
        isUsed={asset.isUsed}
        isUnresolved={unresolvedAssetIds.has(asset.id)}
        itemProps={itemProps}
        onPreview={onPreview}
        onDownload={asset.type === 'apikey' ? null : onDownload}
        onDelete={handleDelete}
        onReplace={onReplace}
      />
    ),
    [
      handleDelete,
      onDownload,
      onPreview,
      onReplace,
      selected,
      unresolvedAssetIds,
    ],
  );

  return (
    <div className="flex min-h-0 flex-col gap-5">
      {!type && (
        <SegmentedSwitcher
          aria-label={intl.formatMessage(messages.filterResourcesByType)}
          options={formatConfig(ASSET_TYPES, intl)}
          value={selectedAssetType}
          onValueChange={handleAssetTypeChange}
          size="md"
          className="w-fit max-w-full"
        />
      )}
      <Collection
        aria-label={intl.formatMessage(messages.resourceLibrary)}
        items={assets}
        keyExtractor={(asset) => asset.id}
        textValueExtractor={assetName}
        layout={layout}
        renderItem={renderItem}
        selectionMode="single"
        selectedKeys={[]}
        onSelectionChange={handleSelectionChange}
        animate
        animationKey={selectedAssetType}
        className="!flex-none"
        viewportClassName="pe-3"
        emptyState={
          <Paragraph emphasis="muted" margin="none" className="py-10">
            {intl.formatMessage(messages.noResourcesToDisplay)}
          </Paragraph>
        }
        fade
      >
        {(CollectionElements) => CollectionElements}
      </Collection>
    </div>
  );
};

// OwnProps - props that must be passed from outside
type OwnProps = {
  type?: string | null;
  selected?: string | null;
  onSelect?: (id: string) => void;
  onDelete?: ((id: string, isUsed: boolean) => void) | null;
  onDownload?: (id: string) => void;
  onPreview?: (id: string) => void;
  onReplace?: (id: string) => void;
  disableDelete?: boolean;
};

export default compose<AssetsProps, OwnProps>(withAssets)(Assets);
