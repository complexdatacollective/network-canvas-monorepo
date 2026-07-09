import { useCallback, useMemo } from 'react';
import { compose } from 'react-recompose';

import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { GridLayout } from '@codaco/fresco-ui/collection/layout/GridLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import AssetCard from './AssetCard';
import withAssets from './withAssets';

type AssetTypeValue =
  | 'image'
  | 'video'
  | 'audio'
  | 'network'
  | 'apikey'
  | 'geojson';

type AssetFilterValue = 'all' | AssetTypeValue;

const ASSET_TYPES: SegmentedOption<AssetFilterValue>[] = [
  { label: 'All', value: 'all' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
  { label: 'Network', value: 'network' },
  { label: 'GeoJSON', value: 'geojson' },
  { label: 'API key', value: 'apikey' },
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
          aria-label="Filter resources by type"
          options={ASSET_TYPES}
          value={selectedAssetType}
          onValueChange={handleAssetTypeChange}
          size="sm"
        />
      )}
      <Collection
        aria-label="Resource library"
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
        className="h-[min(62vh,42rem)]"
        viewportClassName="pr-3"
        emptyState={
          <Paragraph margin="none" className="text-muted py-10">
            No resources to display.
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
