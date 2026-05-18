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

type ThumbnailComponentProps = {
  id: string;
  interactive?: boolean;
  fullWidth?: boolean;
};

const ASSET_COMPONENTS: Record<
  AssetType,
  React.ComponentType<ThumbnailComponentProps>
> = {
  image: Image as unknown as React.ComponentType<ThumbnailComponentProps>,
  video: Video as unknown as React.ComponentType<ThumbnailComponentProps>,
  audio: Audio as unknown as React.ComponentType<ThumbnailComponentProps>,
  network: Network as unknown as React.ComponentType<ThumbnailComponentProps>,
  apikey: APIKey as unknown as React.ComponentType<ThumbnailComponentProps>,
  geojson: GeoJSON as unknown as React.ComponentType<ThumbnailComponentProps>,
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
      if (onClick) {
        onClick(id);
      } else if (onPreview) {
        onPreview(id);
      }
    },
    [onClick, onPreview, id],
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
        if (onClick) {
          onClick(id);
        } else if (onPreview) {
          onPreview(id);
        }
      }
    },
    [onClick, onPreview, id],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cx(
        'group relative size-full',
        (onClick || onPreview) && 'cursor-pointer',
      )}
    >
      <div className="flex size-full items-center justify-center">
        <PreviewComponent
          id={id}
          interactive={!!(onClick || onPreview)}
          fullWidth
        />
      </div>

      <div
        className={cx(
          'bg-rich-black absolute top-(--space-sm) right-(--space-sm) flex items-center justify-center gap-(--space-sm) rounded-sm p-(--space-sm) opacity-0 transition-opacity duration-(--animation-duration-standard) ease-(--animation-easing) group-hover:opacity-100',
        )}
      >
        {onPreview && (
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center text-white"
            onClick={handlePreview}
            aria-label="Preview asset"
          >
            <PreviewIcon className="size-5" />
          </button>
        )}

        {onDownload && (
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center text-white"
            onClick={handleDownload}
            aria-label="Download asset"
          >
            <DownloadIcon className="size-5" />
          </button>
        )}

        {onDelete && (
          <button
            type="button"
            className={cx(
              'flex items-center justify-center text-white',
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
            <DeleteIcon className="size-5" />
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
