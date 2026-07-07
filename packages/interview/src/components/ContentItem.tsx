import { useState } from 'react';
import { useSelector } from 'react-redux';

import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Spinner from '@codaco/fresco-ui/Spinner';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { Item } from '@codaco/protocol-validation';
import { useCaptureException } from '~/analytics/useTrack';
import { useContractFlags } from '~/contract/context';
import { useAssetUrl } from '~/hooks/useAssetUrl';
import { getAssetManifest } from '~/store/modules/protocol';

// UploadThing's CDN serves files uploaded via the `blob` router with an invalid
// Content-Type (e.g. `video` instead of `video/mp4`). Safari strictly requires
// a valid MIME type and refuses to play otherwise. We work around this by
// providing an explicit `type` on the `<source>` element, derived from the
// original `source` filename extension carried in the asset record (the display
// `name` may lack an extension on hand-edited protocols).
const MEDIA_MIME_TYPES: Record<string, string> = {
  // Video
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  // Many .mov files contain codecs such as H.264 or HEVC, but browser
  // support varies by codec, browser, and platform. We use video/mp4
  // instead of video/quicktime because Chrome rejects the latter even
  // when it can decode the underlying codec.
  '.mov': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.ogv': 'video/ogg',
  // Audio (.ogg is audio-only; video ogg files use the .ogv extension above)
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

function getMediaMimeType(
  filename: string | undefined,
  fallback: string,
): string {
  if (!filename) return fallback;
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return fallback;
  const ext = filename.slice(dotIndex).toLowerCase();
  return MEDIA_MIME_TYPES[ext] ?? fallback;
}

// Size applies to image and video items, which carry an optional `size` prop.
// Maps the size magic-strings to max-height bands. Text items are rendered at
// their natural height (no max-height treatment) so all their content shows.
function getSizeClass(size: string | undefined): string {
  return cx(
    size === 'SMALL' && 'max-h-48',
    size === 'MEDIUM' && 'max-h-96',
    size === 'LARGE' && 'max-h-[60vh]',
  );
}

// In E2E the video never loads (preload="none"), so its element box would
// collapse to the browser-default ~150px and every size would mask identically.
// Pin the empty element to the height its size band implies (the same bands
// getSizeClass caps to) so the masked screenshot reflects the real video
// footprint. Sizeless videos fall back to a 16:9 box.
function getE2EVideoBoxClass(size: string | undefined): string {
  return cx(
    size === 'SMALL' && 'h-48',
    size === 'MEDIUM' && 'h-96',
    size === 'LARGE' && 'h-[60vh]',
    !size && 'aspect-video',
  );
}

function ItemFallback({ message }: { message: string }) {
  return (
    <div
      data-testid="information-item-fallback"
      className="border-accent flex items-center justify-center rounded border border-dashed p-4"
    >
      <Paragraph intent="smallText" className="text-center">
        {message}
      </Paragraph>
    </div>
  );
}

type MediaLoadState = 'loading' | 'loaded' | 'error';

function VideoPlayer({
  src,
  name,
  source,
  isE2E,
  size,
}: {
  src: string;
  name: string;
  source: string | undefined;
  isE2E: boolean;
  size: string | undefined;
}) {
  const [state, setState] = useState<MediaLoadState>('loading');
  const captureException = useCaptureException();

  // Disable autoPlay and preload to prevent browser crashes in headless E2E tests.
  // MIME type derives from the source filename, falling back to the display name.
  const mimeType = getMediaMimeType(source ?? name, 'video/mp4');
  const sizeClass = getSizeClass(size);

  return (
    <div
      className={cx('relative', sizeClass, state === 'loading' && 'min-h-48')}
    >
      {state === 'loading' && !isE2E && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
          <Paragraph intent="smallText">Loading video...</Paragraph>
        </div>
      )}
      {state === 'error' && (
        <Paragraph intent="smallText" className="text-center">
          Video could not be loaded.
        </Paragraph>
      )}
      <video
        loop
        controls
        aria-label={name}
        autoPlay={!isE2E}
        muted={!isE2E}
        playsInline
        preload={isE2E ? 'none' : 'auto'}
        className={cx(
          'w-full object-contain',
          sizeClass,
          isE2E && getE2EVideoBoxClass(size),
          (state === 'loading' && !isE2E) || state === 'error'
            ? 'invisible h-0'
            : '',
        )}
        onLoadedData={() => setState('loaded')}
        onError={(e) => {
          setState('error');
          const code = e.currentTarget.error?.code ?? 'unknown';
          captureException(new Error(`video load failed: ${code}`), {
            feature: 'information-media',
            media_kind: 'video',
          });
        }}
      >
        <source src={src} type={mimeType} />
      </video>
    </div>
  );
}

function AssetItem({ item, isE2E }: { item: Item; isE2E: boolean }) {
  const assetManifest = useSelector(getAssetManifest);
  const assetMeta = assetManifest[item.content];
  const { url, isLoading } = useAssetUrl(item.content);
  // `size` exists only on asset items (text items have no size).
  const itemSize = item.type === 'asset' ? item.size : undefined;

  if (!assetMeta) {
    return <ItemFallback message="This item could not be displayed." />;
  }

  if (isLoading) {
    const sizeClass =
      assetMeta.type === 'image'
        ? cx(
            itemSize === 'SMALL' && 'min-h-48',
            itemSize === 'MEDIUM' && 'min-h-96',
            itemSize === 'LARGE' && 'min-h-[60vh]',
          )
        : 'min-h-12';

    return (
      <div className={cx('flex items-center justify-center', sizeClass)}>
        <Spinner />
      </div>
    );
  }

  if (!url) {
    return <ItemFallback message="This item could not be displayed." />;
  }

  switch (assetMeta.type) {
    case 'image':
      return (
        <img
          src={url}
          alt={item.description ?? ''}
          className={cx('size-full object-contain', getSizeClass(itemSize))}
        />
      );
    case 'audio':
      return (
        <audio
          controls
          autoPlay
          aria-label={item.description ?? assetMeta.name}
        >
          <source
            src={url}
            type={getMediaMimeType(
              assetMeta.source ?? assetMeta.name,
              'audio/mpeg',
            )}
          />
          <track kind="captions" />
        </audio>
      );
    case 'video':
      return (
        <VideoPlayer
          src={url}
          name={assetMeta.name}
          source={assetMeta.source}
          isE2E={isE2E}
          size={itemSize}
        />
      );
    case 'network':
    case 'geojson':
    case 'apikey':
      return <ItemFallback message="This item could not be displayed." />;
  }
}

type ContentItemProps = {
  item: Item;
  /**
   * Elements permitted in a text item's markdown. Defaults to the full
   * section set used by the Information interface; contexts embedded beneath
   * their own heading (e.g. the FamilyPedigree intro dialog) pass a
   * restricted set.
   */
  allowedTextElements?: string[];
};

/**
 * Renders one content item (text or asset) from the Information content-item
 * model, shared by the Information interface and the FamilyPedigree intro
 * screen.
 */
export default function ContentItem({
  item,
  allowedTextElements = ALLOWED_MARKDOWN_SECTION_TAGS,
}: ContentItemProps) {
  const { isE2E } = useContractFlags();

  switch (item.type) {
    case 'text':
      return (
        <RenderMarkdown allowedElements={allowedTextElements}>
          {item.content}
        </RenderMarkdown>
      );
    case 'asset':
      return <AssetItem item={item} isE2E={isE2E} />;
  }
}
