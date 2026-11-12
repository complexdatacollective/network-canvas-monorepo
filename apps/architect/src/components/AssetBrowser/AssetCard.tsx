import { Download, Eye, Trash2, Upload } from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { IconButton } from '@codaco/fresco-ui/Button';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
// One definition, shared with the card a stage field shows for the same
// resource.
import {
  RESOURCE_KIND_BADGE_COLORS,
  RESOURCE_KIND_ICONS,
} from '@codaco/protocol-builder/resources/components/resourceKinds';
import { assetMetadataMessages } from '~/components/Assets/assetMetadataMessages';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';
import { getBundledAssetUrl } from '~/templates/bundled-asset-url';
import { getAssetBlobUrl, revokeBlobUrl } from '~/utils/assetUtils';
import { cx } from '~/utils/cva';
import { reportError } from '~/utils/reportError';
const messages = defineMessages({
  videoPreview: {
    id: 'architect.assetBrowser.assetCard.videoPreview',
    defaultMessage: '{name} video preview',
    description:
      'Accessible name of the video thumbnail on a resource card; read only by screen readers. name is the researcher-given name of the video resource.',
  },
  preview: {
    id: 'architect.assetBrowser.assetCard.preview',
    defaultMessage: 'Preview {name}',
    description:
      'Accessible name of the icon button on a resource card that opens a preview of the resource; read only by screen readers. name is the resource name.',
  },
  previewResource: {
    id: 'architect.assetBrowser.assetCard.previewResource',
    defaultMessage: 'Preview resource',
    description:
      'Tooltip of the icon button on a resource card that opens a preview of the resource. Preview here is a verb.',
  },
  download: {
    id: 'architect.assetBrowser.assetCard.download',
    defaultMessage: 'Download {name}',
    description:
      'Accessible name of the icon button on a resource card that downloads the resource file; read only by screen readers. name is the resource name.',
  },
  downloadResource: {
    id: 'architect.assetBrowser.assetCard.downloadResource',
    defaultMessage: 'Download resource',
    description:
      'Tooltip of the icon button on a resource card that downloads the resource file. Download here is a verb.',
  },
  isInUseAndCannot: {
    id: 'architect.assetBrowser.assetCard.isInUseAndCannot',
    defaultMessage: '{name} is in use and cannot be deleted',
    description:
      'Accessible name of the delete button on a resource card when a stage still uses the resource, so it cannot be deleted; read only by screen readers. name is the resource name.',
  },
  delete: {
    id: 'architect.assetBrowser.assetCard.delete',
    defaultMessage: 'Delete {name}',
    description:
      'Accessible name of the icon button on a resource card that deletes the resource; read only by screen readers. name is the resource name.',
  },
  thisResourceIsInUseBy: {
    id: 'architect.assetBrowser.assetCard.thisResourceIsInUseBy',
    defaultMessage:
      'This resource is in use by the protocol and cannot be deleted',
    description:
      'Tooltip of the delete button on a resource card when the resource is used by a stage in the protocol and therefore cannot be deleted.',
  },
  deleteResource: {
    id: 'architect.assetBrowser.assetCard.deleteResource',
    defaultMessage: 'Delete resource',
    description:
      'Tooltip of the icon button on a resource card that deletes the resource. Delete here is a verb.',
  },
  unused: {
    id: 'architect.assetBrowser.assetCard.unused',
    defaultMessage: 'Unused',
    description:
      'Badge on a resource card showing that no stage in the protocol uses this resource.',
  },
  missing: {
    id: 'architect.assetBrowser.assetCard.missing',
    defaultMessage: 'File missing',
    description:
      'Badge on a resource card showing that the protocol lists this resource but its file is not stored, because the imported protocol file did not contain it.',
  },
  replace: {
    id: 'architect.assetBrowser.assetCard.replace',
    defaultMessage: 'Add the file for {name}',
    description:
      'Accessible name of the icon button on a resource card that lets the researcher choose the missing file for the resource; read only by screen readers. name is the resource name.',
  },
  replaceResource: {
    id: 'architect.assetBrowser.assetCard.replaceResource',
    defaultMessage: 'Add the missing file',
    description:
      'Tooltip of the icon button on a resource card that opens a file picker so the researcher can supply the file missing for this resource.',
  },
});

type AssetType = keyof typeof RESOURCE_KIND_BADGE_COLORS;

type AssetCardProps = {
  id: string;
  isCurrent?: boolean;
  isUsed?: boolean;
  /**
   * The protocol declares this resource but no file is stored for it — it came
   * from an archive that did not contain one. Everything else about the
   * resource is intact, so the card shows it and offers the one action that
   * resolves it.
   */
  isUnresolved?: boolean;
  name: string;
  source?: string;
  type: AssetType;
  itemProps: ItemProps;
  onDelete?: ((id: string, isUsed: boolean) => void) | null;
  onDownload?: ((id: string) => void) | null;
  onPreview?: ((id: string) => void) | null;
  onReplace?: ((id: string) => void) | null;
};

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

  const bundledUrl = await getBundledAssetUrl(source);
  return bundledUrl ? { url: bundledUrl, revoke: false } : null;
};

const useAssetPreviewUrl = (
  id: string,
  source: string | undefined,
  type: AssetType,
) => {
  // The URL is stored against the asset it was read for, so the card that is
  // rendering now can never show the previous asset's preview: a URL that does
  // not belong to this asset is simply not used, and there is no clearing
  // setState racing the read that replaces it.
  const [loaded, setLoaded] = useState<{
    id: string;
    source: string | undefined;
    type: AssetType;
    url: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: AssetPreviewUrl | null = null;

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
      setLoaded({ id, source, type, url: nextUrl.url });
    };

    void loadPreviewUrl();

    return () => {
      isMounted = false;
      if (currentUrl?.revoke) {
        revokeBlobUrl(currentUrl.url);
      }
    };
  }, [id, source, type]);

  if (
    !loaded ||
    loaded.id !== id ||
    loaded.source !== source ||
    loaded.type !== type
  ) {
    return null;
  }

  return loaded.url;
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
  const Icon = RESOURCE_KIND_ICONS[type];

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
  isUnresolved = false,
  name,
  source,
  type,
  itemProps,
  onDelete = null,
  onDownload = null,
  onPreview = null,
  onReplace = null,
}: AssetCardProps) => {
  const intl = useAppIntl();
  const readOnly = useProtocolReadOnly();
  const typeLabel = intl.formatMessage(assetMetadataMessages[type]);
  const typeColor = RESOURCE_KIND_BADGE_COLORS[type];
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

  const handleReplace = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      onReplace?.(id);
    },
    [id, onReplace],
  );

  const actions = useMemo(
    () => [
      isUnresolved && onReplace && (
        <IconButton
          key="replace"
          icon={<Upload />}
          aria-label={intl.formatMessage(messages.replace, { name: name })}
          title={intl.formatMessage(messages.replaceResource)}
          color="primary"
          variant="text"
          size="sm"
          onClick={handleReplace}
          onMouseDown={stopCardSelection}
          disabled={readOnly}
        />
      ),
      !isUnresolved && onPreview && (
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
      !isUnresolved && onDownload && (
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
          disabled={readOnly}
        />
      ),
    ],
    [
      handleDelete,
      handleDownload,
      handlePreview,
      handleReplace,
      isUnresolved,
      isUsed,
      name,
      onDelete,
      onDownload,
      onPreview,
      onReplace,
      intl,
      readOnly,
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
        {isUnresolved ? (
          <Badge
            tone="destructive"
            className="absolute inset-s-3 top-3 border-0"
          >
            {intl.formatMessage(messages.missing)}
          </Badge>
        ) : (
          !isUsed && (
            <Badge
              tone="destructive"
              className="absolute inset-s-3 top-3 border-0"
            >
              {intl.formatMessage(messages.unused)}
            </Badge>
          )
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
          <Badge appearance="outline" color={typeColor} className="shrink-0">
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
