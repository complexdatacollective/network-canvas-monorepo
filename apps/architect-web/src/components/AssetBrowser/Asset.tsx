import { DeleteIcon, DownloadIcon, Eye as PreviewIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import {
  APIKey,
  Audio,
  GeoJSON,
  Image,
  Network,
  Video,
} from '~/components/Thumbnail';
import { cx } from '~/utils/cva';

type AssetProps = {
  id: string;
  isUsed?: boolean;
  onClick?: (id: string) => void;
  onDelete?: ((id: string, isUsed: boolean) => void) | null;
  onDownload?: ((id: string) => void) | null;
  onPreview?: ((id: string) => void) | null;
  type: string;
};

const FallBackAssetComponent = () => (
  <div>No preview component available for this asset type.</div>
);

type AssetType = 'image' | 'video' | 'audio' | 'network' | 'apikey' | 'geojson';

// Use a more lenient type since these are HOC-wrapped components
const ASSET_COMPONENTS: Record<
  AssetType,
  React.ComponentType<Record<string, unknown>>
> = {
  image: Image as unknown as React.ComponentType<Record<string, unknown>>,
  video: Video as unknown as React.ComponentType<Record<string, unknown>>,
  audio: Audio as unknown as React.ComponentType<Record<string, unknown>>,
  network: Network as unknown as React.ComponentType<Record<string, unknown>>,
  apikey: APIKey as unknown as React.ComponentType<Record<string, unknown>>,
  geojson: GeoJSON as unknown as React.ComponentType<Record<string, unknown>>,
};

const Asset = ({
  id,
  isUsed = false,
  onClick,
  onDelete = null,
  onDownload = null,
  onPreview = null,
  type,
}: AssetProps) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.(id);
    },
    [onClick, id],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(id, isUsed);
    },
    [onDelete, isUsed, id],
  );

  const handlePreview = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onPreview) {
        onPreview(id);
      }
    },
    [onPreview, id],
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onDownload) {
        onDownload(id);
      }
    },
    [onDownload, id],
  );

  const PreviewComponent = useMemo(() => {
    const assetType = type as AssetType;
    return ASSET_COMPONENTS[assetType] || FallBackAssetComponent;
  }, [type]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(id);
      }
    },
    [onClick, id],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cx('group relative size-full', onClick && 'cursor-pointer')}
    >
      <div
        className={cx(
          'flex size-full items-center justify-center',
          '[&_.thumbnail]:flex [&_.thumbnail]:w-full',
          onClick &&
            '[&_.thumbnail]:cursor-pointer [&_.thumbnail]:transition-opacity [&_.thumbnail]:duration-(--animation-duration-fast) [&_.thumbnail]:ease-(--animation-easing) [&_.thumbnail:hover]:opacity-80',
        )}
      >
        <PreviewComponent id={id} />
      </div>

      <div
        className={cx(
          'bg-rich-black absolute top-(--space-sm) right-(--space-sm) flex items-center justify-center rounded-sm px-(--space-sm) pt-(--space-sm) pb-(--space-xs) opacity-0 transition-opacity duration-(--animation-duration-standard) ease-(--animation-easing) group-hover:opacity-100',
        )}
      >
        {onPreview && (
          <button
            type="button"
            className="ml-(--space-sm) cursor-pointer text-white first:ml-0"
            onClick={handlePreview}
            aria-label="Preview asset"
          >
            <PreviewIcon />
          </button>
        )}

        {onDownload && (
          <button
            type="button"
            className="ml-(--space-sm) cursor-pointer text-white first:ml-0"
            onClick={handleDownload}
            aria-label="Download asset"
          >
            <DownloadIcon />
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            className={cx(
              'ml-(--space-sm) text-white first:ml-0',
              isUsed ? 'cursor-not-allowed' : 'cursor-pointer',
            )}
            onClick={handleDelete}
            title={
              isUsed
                ? 'This asset is in use by the protocol and cannot be deleted'
                : ''
            }
            aria-label={
              isUsed ? 'Cannot delete - asset in use' : 'Delete asset'
            }
          >
            <DeleteIcon />
          </button>
        )}
      </div>

      {!isUsed && (
        <span className="bg-error text-error-foreground absolute bottom-(--space-xs) left-(--space-xs) rounded p-(--space-sm) text-xs">
          Unused
        </span>
      )}
    </button>
  );
};

export default Asset;
