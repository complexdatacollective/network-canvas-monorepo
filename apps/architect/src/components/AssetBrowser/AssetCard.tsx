import {
  AudioLines,
  Download,
  Eye,
  FileImage,
  FileJson,
  KeyRound,
  Share2,
  Trash2,
  Video,
} from 'lucide-react';
import {
  type ComponentType,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Badge, type BadgeColor } from '@codaco/fresco-ui/Badge';
import { IconButton } from '@codaco/fresco-ui/Button';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { getAssetBlobUrl, revokeBlobUrl } from '~/utils/assetUtils';
import { cx } from '~/utils/cva';
import { reportError } from '~/utils/reportError';

type AssetType = 'image' | 'video' | 'audio' | 'network' | 'apikey' | 'geojson';

type AssetCardProps = {
  id: string;
  isCurrent?: boolean;
  isUsed?: boolean;
  name: string;
  source?: string;
  type: AssetType;
  itemProps: ItemProps;
  onDelete?: ((id: string, isUsed: boolean) => void) | null;
  onDownload?: ((id: string) => void) | null;
  onPreview?: ((id: string) => void) | null;
};

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  network: 'Network',
  apikey: 'API key',
  geojson: 'GeoJSON',
};

const ASSET_TYPE_BADGE_COLORS = {
  image: 'sea-green',
  video: 'slate-blue',
  audio: 'neon-coral',
  network: 'cerulean-blue',
  apikey: 'mustard',
  geojson: 'sea-serpent',
} satisfies Record<AssetType, BadgeColor>;

const ASSET_TYPE_ICONS = {
  image: FileImage,
  video: Video,
  audio: AudioLines,
  network: Share2,
  apikey: KeyRound,
  geojson: FileJson,
} satisfies Record<AssetType, ComponentType<{ className?: string }>>;

const PREVIEW_URL_TYPES = new Set<AssetType>(['image', 'video']);

const useAssetPreviewUrl = (id: string, type: AssetType) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;

    setUrl(null);

    if (!PREVIEW_URL_TYPES.has(type)) {
      return undefined;
    }

    const loadPreviewUrl = async () => {
      try {
        const nextUrl = await getAssetBlobUrl(id);
        if (!nextUrl) return;

        if (!isMounted) {
          revokeBlobUrl(nextUrl);
          return;
        }

        currentUrl = nextUrl;
        setUrl(nextUrl);
      } catch (error) {
        reportError(error);
      }
    };

    void loadPreviewUrl();

    return () => {
      isMounted = false;
      if (currentUrl) {
        revokeBlobUrl(currentUrl);
      }
    };
  }, [id, type]);

  return url;
};

const stopCardSelection = (event: MouseEvent) => {
  event.stopPropagation();
};

const AssetPreview = ({
  id,
  name,
  type,
}: {
  id: string;
  name: string;
  type: AssetType;
}) => {
  const previewUrl = useAssetPreviewUrl(id, type);
  const Icon = ASSET_TYPE_ICONS[type];

  if (type === 'image' && previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={name}
        className="size-full object-cover"
        draggable={false}
      />
    );
  }

  if (type === 'video' && previewUrl) {
    return (
      <video
        src={previewUrl}
        aria-label={`${name} video preview`}
        className="size-full object-cover"
        muted
        playsInline
        disablePictureInPicture
        preload="auto"
      />
    );
  }

  return (
    <div className="bg-surface-2 text-surface-2-contrast flex size-full items-center justify-center">
      <Icon aria-hidden className="size-14 opacity-70" />
    </div>
  );
};

const AssetCard = ({
  id,
  isCurrent = false,
  isUsed = false,
  name,
  source,
  type,
  itemProps,
  onDelete = null,
  onDownload = null,
  onPreview = null,
}: AssetCardProps) => {
  const typeLabel = ASSET_TYPE_LABELS[type];
  const typeColor = ASSET_TYPE_BADGE_COLORS[type];
  const handleDelete = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onDelete?.(id, isUsed);
    },
    [id, isUsed, onDelete],
  );

  const handlePreview = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onPreview?.(id);
    },
    [id, onPreview],
  );

  const handleDownload = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onDownload?.(id);
    },
    [id, onDownload],
  );

  const actions = useMemo(
    () => [
      onPreview && (
        <IconButton
          key="preview"
          icon={<Eye />}
          aria-label={`Preview ${name}`}
          title="Preview resource"
          color="info"
          variant="text"
          size="sm"
          onClick={handlePreview}
          onMouseDown={stopCardSelection}
        />
      ),
      onDownload && (
        <IconButton
          key="download"
          icon={<Download />}
          aria-label={`Download ${name}`}
          title="Download resource"
          color="success"
          variant="text"
          size="sm"
          onClick={handleDownload}
          onMouseDown={stopCardSelection}
        />
      ),
      onDelete && (
        <IconButton
          key="delete"
          icon={<Trash2 />}
          aria-label={
            isUsed
              ? `${name} is in use and cannot be deleted`
              : `Delete ${name}`
          }
          title={
            isUsed
              ? 'This resource is in use by the protocol and cannot be deleted'
              : 'Delete resource'
          }
          color="destructive"
          variant="text"
          size="sm"
          onClick={handleDelete}
          onMouseDown={stopCardSelection}
        />
      ),
    ],
    [
      handleDelete,
      handleDownload,
      handlePreview,
      isUsed,
      name,
      onDelete,
      onDownload,
      onPreview,
    ],
  );

  return (
    <article
      {...itemProps}
      data-current={isCurrent || undefined}
      className={cx(
        'focusable group bg-surface-1 text-surface-1-contrast flex h-80 flex-col overflow-hidden rounded border-2 border-transparent',
        'effect-shadow-sm transition-[border-color,background-color,box-shadow,translate] duration-200',
        'data-current:border-primary data-focused:border-primary data-selected:border-primary data-selected:bg-selected',
      )}
    >
      <div className="bg-surface relative h-40 shrink-0 overflow-hidden rounded-t">
        <AssetPreview id={id} name={name} type={type} />
        {!isUsed && (
          <Badge
            variant="destructive"
            className="absolute top-3 left-3 border-0"
          >
            Unused
          </Badge>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <Heading level="h4" margin="none" className="truncate text-lg">
            {name}
          </Heading>
          <Paragraph
            margin="none"
            className="text-muted mt-1 truncate text-sm"
            title={source}
          >
            {source ?? typeLabel}
          </Paragraph>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <Badge color={typeColor} className="shrink-0">
            {typeLabel}
          </Badge>

          {actions.some(Boolean) && (
            <div className="flex justify-end gap-1 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              {actions}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default AssetCard;
