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

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge, type BadgeColor } from '@codaco/fresco-ui/Badge';
import { IconButton } from '@codaco/fresco-ui/Button';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { assetMetadataMessages } from '~/components/Assets/assetMetadataMessages';
import { getBundledAssetUrl } from '~/templates/bundled-asset-url';
import { getAssetBlobUrl, revokeBlobUrl } from '~/utils/assetUtils';
import { cx } from '~/utils/cva';
import { reportError } from '~/utils/reportError';
const messages = defineMessages({
  videoPreview: {
    id: 'architect.assetBrowser.assetCard.videoPreview',
    defaultMessage: '{name} video preview',
    description:
      'The aria-label text in components / AssetBrowser / AssetCard.',
  },
  preview: {
    id: 'architect.assetBrowser.assetCard.preview',
    defaultMessage: 'Preview {name}',
    description:
      'The aria-label text in components / AssetBrowser / AssetCard.',
  },
  previewResource: {
    id: 'architect.assetBrowser.assetCard.previewResource',
    defaultMessage: 'Preview resource',
    description: 'The title text in components / AssetBrowser / AssetCard.',
  },
  download: {
    id: 'architect.assetBrowser.assetCard.download',
    defaultMessage: 'Download {name}',
    description:
      'The aria-label text in components / AssetBrowser / AssetCard.',
  },
  downloadResource: {
    id: 'architect.assetBrowser.assetCard.downloadResource',
    defaultMessage: 'Download resource',
    description: 'The title text in components / AssetBrowser / AssetCard.',
  },
  isInUseAndCannot: {
    id: 'architect.assetBrowser.assetCard.isInUseAndCannot',
    defaultMessage: '{name} is in use and cannot be deleted',
    description:
      'The aria-label text in components / AssetBrowser / AssetCard.',
  },
  delete: {
    id: 'architect.assetBrowser.assetCard.delete',
    defaultMessage: 'Delete {name}',
    description:
      'The aria-label text in components / AssetBrowser / AssetCard.',
  },
  thisResourceIsInUseBy: {
    id: 'architect.assetBrowser.assetCard.thisResourceIsInUseBy',
    defaultMessage:
      'This resource is in use by the protocol and cannot be deleted',
    description: 'The title text in components / AssetBrowser / AssetCard.',
  },
  deleteResource: {
    id: 'architect.assetBrowser.assetCard.deleteResource',
    defaultMessage: 'Delete resource',
    description: 'The title text in components / AssetBrowser / AssetCard.',
  },
  unused: {
    id: 'architect.assetBrowser.assetCard.unused',
    defaultMessage: 'Unused',
    description: 'Visible text in components / AssetBrowser / AssetCard.',
  },
});

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

type AssetPreviewUrl = {
  url: string;
  revoke: boolean;
};

const loadAssetPreviewUrl = async (
  id: string,
  source: string | undefined,
): Promise<AssetPreviewUrl | null> => {
  try {
    const blobUrl = await getAssetBlobUrl(id);
    if (blobUrl) {
      return { url: blobUrl, revoke: true };
    }
  } catch (error) {
    reportError(error);
  }

  const bundledUrl = getBundledAssetUrl(source);
  return bundledUrl ? { url: bundledUrl, revoke: false } : null;
};

const useAssetPreviewUrl = (
  id: string,
  source: string | undefined,
  type: AssetType,
) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: AssetPreviewUrl | null = null;

    setUrl(null);

    if (!PREVIEW_URL_TYPES.has(type)) {
      return undefined;
    }

    const loadPreviewUrl = async () => {
      const nextUrl = await loadAssetPreviewUrl(id, source);
      if (!nextUrl) return;

      if (!isMounted) {
        if (nextUrl.revoke) {
          revokeBlobUrl(nextUrl.url);
        }
        return;
      }

      currentUrl = nextUrl;
      setUrl(nextUrl.url);
    };

    void loadPreviewUrl();

    return () => {
      isMounted = false;
      if (currentUrl?.revoke) {
        revokeBlobUrl(currentUrl.url);
      }
    };
  }, [id, source, type]);

  return url;
};

const stopCardSelection = (event: MouseEvent) => {
  event.stopPropagation();
};

const AssetPreview = ({
  id,
  name,
  source,
  type,
}: {
  id: string;
  name: string;
  source?: string;
  type: AssetType;
}) => {
  const intl = useAppIntl();
  const previewUrl = useAssetPreviewUrl(id, source, type);
  const Icon = ASSET_TYPE_ICONS[type];

  if (type === 'image' && previewUrl) {
    return (
      <div
        data-theme-interview
        className="bg-background flex size-full items-center justify-center"
      >
        <img
          src={previewUrl}
          alt={name}
          className="size-full object-contain object-center"
          draggable={false}
        />
      </div>
    );
  }

  if (type === 'video' && previewUrl) {
    return (
      <div
        data-theme-interview
        className="bg-background flex size-full items-center justify-center"
      >
        <video
          src={previewUrl}
          aria-label={intl.formatMessage(messages.videoPreview, { name: name })}
          className="size-full object-contain"
          muted
          playsInline
          disablePictureInPicture
          preload="auto"
        />
      </div>
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
  const intl = useAppIntl();
  const typeLabel = intl.formatMessage(assetMetadataMessages[type]);
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
          aria-label={intl.formatMessage(messages.preview, { name: name })}
          title={intl.formatMessage(messages.previewResource)}
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
          aria-label={intl.formatMessage(messages.download, { name: name })}
          title={intl.formatMessage(messages.downloadResource)}
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
              ? intl.formatMessage(messages.isInUseAndCannot, { name: name })
              : intl.formatMessage(messages.delete, { name: name })
          }
          title={
            isUsed
              ? intl.formatMessage(messages.thisResourceIsInUseBy)
              : intl.formatMessage(messages.deleteResource)
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
      intl,
    ],
  );

  return (
    <Surface
      as="article"
      noContainer
      spacing="none"
      shadow="sm"
      {...itemProps}
      data-current={isCurrent || undefined}
      className={cx(
        'focusable group flex h-80 flex-col overflow-hidden! border-2 border-transparent',
        'transition-[border-color,background-color,box-shadow,translate] duration-200',
        'data-current:border-primary data-focused:border-primary data-selected:border-primary data-selected:bg-selected',
      )}
    >
      <div className="bg-surface relative h-40 shrink-0 overflow-hidden rounded-t">
        <AssetPreview id={id} name={name} source={source} type={type} />
        {!isUsed && (
          <Badge
            variant="destructive"
            className="absolute top-3 left-3 border-0"
          >
            {intl.formatMessage(messages.unused)}
          </Badge>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <Heading
            level="h4"
            margin="none"
            className="line-clamp-2 text-lg leading-tight wrap-anywhere"
            title={name}
          >
            {name}
          </Heading>
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
    </Surface>
  );
};

export default AssetCard;
