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
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';

import AssetCard from './AssetCard';
import withAssets from './withAssets';
const configMessages = defineMessages({
  all: {
    id: 'architect.assetBrowser.assets.config.all',
    defaultMessage: 'All',
    description:
      'Presentation label or description in components/AssetBrowser/Assets.tsx. Identifiers are not translated.',
  },
  image: {
    id: 'architect.assetBrowser.assets.config.image',
    defaultMessage: 'Image',
    description:
      'Presentation label or description in components/AssetBrowser/Assets.tsx. Identifiers are not translated.',
  },
  video: {
    id: 'architect.assetBrowser.assets.config.video',
    defaultMessage: 'Video',
    description:
      'Presentation label or description in components/AssetBrowser/Assets.tsx. Identifiers are not translated.',
  },
  audio: {
    id: 'architect.assetBrowser.assets.config.audio',
    defaultMessage: 'Audio',
    description:
      'Presentation label or description in components/AssetBrowser/Assets.tsx. Identifiers are not translated.',
  },
  network: {
    id: 'architect.assetBrowser.assets.config.network',
    defaultMessage: 'Network',
    description:
      'Presentation label or description in components/AssetBrowser/Assets.tsx. Identifiers are not translated.',
  },
  geoJSON: {
    id: 'architect.assetBrowser.assets.config.geoJSON',
    defaultMessage: 'GeoJSON',
    description:
      'Presentation label or description in components/AssetBrowser/Assets.tsx. Identifiers are not translated.',
  },
  aPIKey: {
    id: 'architect.assetBrowser.assets.config.aPIKey',
    defaultMessage: 'API key',
    description:
      'Presentation label or description in components/AssetBrowser/Assets.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  filterResourcesByType: {
    id: 'architect.assetBrowser.assets.filterResourcesByType',
    defaultMessage: 'Filter resources by type',
    description: 'The aria-label text in components / AssetBrowser / Assets.',
  },
  resourceLibrary: {
    id: 'architect.assetBrowser.assets.resourceLibrary',
    defaultMessage: 'Resource library',
    description: 'The aria-label text in components / AssetBrowser / Assets.',
  },
  noResourcesToDisplay: {
    id: 'architect.assetBrowser.assets.noResourcesToDisplay',
    defaultMessage: 'No resources to display.',
    description: 'Visible text in components / AssetBrowser / Assets.',
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

type AssetsProps = {
  type?: string | null;
  assets?: AssetType[];
  assetType?: string | null;
  onUpdateAssetFilter: (value: string | null) => void;
  onSelect?: (id: string) => void;
  onDelete?: ((id: string, isUsed: boolean) => void) | null;
  onDownload?: (id: string) => void;
  onPreview?: (id: string) => void;
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
  disableDelete = false,
  selected = null,
}: AssetsProps) => {
  const intl = useAppIntl();
  const handleDelete = disableDelete ? null : onDelete;
  const selectedAssetType = (assetType ?? 'all') as AssetFilterValue;

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

      onPreview?.(selectedKey);
    },
    [onPreview, onSelect],
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
        itemProps={itemProps}
        onPreview={onPreview}
        onDownload={asset.type === 'apikey' ? null : onDownload}
        onDelete={handleDelete}
      />
    ),
    [handleDelete, onDownload, onPreview, selected],
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
        textValueExtractor={(asset) => asset.name}
        layout={layout}
        renderItem={renderItem}
        selectionMode="single"
        selectedKeys={[]}
        onSelectionChange={handleSelectionChange}
        animate
        animationKey={selectedAssetType}
        className="!flex-none"
        viewportClassName="pr-3"
        emptyState={
          <Paragraph margin="none" className="py-10 text-current/70">
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
  disableDelete?: boolean;
};

export default compose<AssetsProps, OwnProps>(withAssets)(Assets);
