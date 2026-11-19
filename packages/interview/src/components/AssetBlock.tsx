'use client';

import { type ReactNode, useState } from 'react';
import { useSelector } from 'react-redux';

import { AppMessage } from '@codaco/app-i18n/react';
import type { MarkdownBlockImages } from '@codaco/fresco-ui/RenderMarkdown';
import Spinner from '@codaco/fresco-ui/Spinner';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  ASSET_BLOCK_DEFAULTS,
  type AssetBlock,
  type AssetBlockAlignment,
  type AssetBlockSize,
  isAssetBlockUrl,
  readAssetBlockUrl,
} from '@codaco/protocol-validation';

import { useCaptureException } from '../analytics/useTrack';
import { useContractFlags } from '../contract/context';
import { withoutMarkedValues } from '../dynamicValues/DynamicText';
import { useAssetUrl } from '../hooks/useAssetUrl';
import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { getAssetManifest } from '../store/modules/protocol';

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

// Size applies to images and videos. Each size is a band the height is held
// to; without one the file is as tall as it is at the page's full width.
function getSizeClass(size: AssetBlockSize | undefined): string {
  return cx(
    size === 'small' && 'max-h-48',
    size === 'medium' && 'max-h-96',
    size === 'large' && 'max-h-[60vh]',
  );
}

// An image or video held to a height is drawn inside a box as wide as the
// page, so where it sits across the page is where it sits in that box. At the
// page's full width there is nowhere else for it to sit.
function getPositionClass(align: AssetBlockAlignment): string {
  return cx(
    align === 'start' && 'object-left rtl:object-right',
    align === 'end' && 'object-right rtl:object-left',
  );
}

// An audio player is as wide as the browser draws it, and sits in its line.
function getJustifyClass(align: AssetBlockAlignment): string {
  return cx(
    align === 'start' && 'justify-start',
    align === 'center' && 'justify-center',
    align === 'end' && 'justify-end',
  );
}

// In E2E the video never loads (preload="none"), so its element box would
// collapse to the browser-default ~150px and every size would mask identically.
// Pin the empty element to the height its size band implies (the same bands
// getSizeClass caps to) so the masked screenshot reflects the real video
// footprint. Sizeless videos fall back to a 16:9 box.
function getE2EVideoBoxClass(size: AssetBlockSize | undefined): string {
  return cx(
    size === 'small' && 'h-48',
    size === 'medium' && 'h-96',
    size === 'large' && 'h-[60vh]',
    !size && 'aspect-video',
  );
}

function ItemFallback() {
  return (
    <div
      data-testid="information-item-fallback"
      className="border-accent flex items-center justify-center rounded border border-dashed p-4"
    >
      <Paragraph intent="smallText" className="text-center">
        <AppMessage message={messages.itemUnavailable} />
      </Paragraph>
    </div>
  );
}

type MediaLoadState = 'loading' | 'loaded' | 'error';

function VideoPlayer({
  src,
  name,
  description,
  source,
  isE2E,
  size,
  align,
  autoplay,
  loop,
}: {
  src: string;
  name: string;
  /**
   * What the researcher wrote about this video, which names the player for a
   * participant who cannot see it. The same key an image reads as its alt text
   * and an audio player reads as its own name. The file's name is the
   * researcher's filing label and never names the player.
   */
  description: string | undefined;
  source: string | undefined;
  isE2E: boolean;
  size: AssetBlockSize | undefined;
  align: AssetBlockAlignment;
  autoplay: boolean;
  loop: boolean;
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
        </div>
      )}
      {state === 'error' && (
        <Paragraph intent="smallText" className="text-center">
          <AppMessage message={messages.itemUnavailable} />
        </Paragraph>
      )}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- protocol assets carry no caption file (the asset schema has no field for one), so there is no track to point at. */}
      <video
        loop={loop}
        controls
        aria-label={description ?? 'Video'}
        lang={description ? undefined : 'en'}
        // A browser starts a video by itself only without its sound, so one
        // that starts by itself starts muted; one the participant starts
        // plays with its sound.
        autoPlay={autoplay && !isE2E}
        muted={autoplay && !isE2E}
        playsInline
        preload={isE2E ? 'none' : 'auto'}
        className={cx(
          'w-full object-contain',
          sizeClass,
          size !== undefined && getPositionClass(align),
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

/** A block's place among the page's paragraphs: a line of its own. */
function Block({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-asset-block=""
      className={cx('not-first:mt-4 not-last:mb-4', className)}
    >
      {children}
    </div>
  );
}

/**
 * What the researcher wrote about a file, or `undefined` when they wrote
 * nothing a participant could use.
 *
 * Text written by hand can hold a description of `"   "`. Read literally that
 * is an accessible name made of whitespace, announced as nothing or as a run
 * of spaces, so a blank description is the same answer as no description at
 * all. A value the interview fills in is never part of an attribute, so one
 * written into a description is left out, with the index and comments that
 * stand in for it until it is placed.
 */
function descriptionOf(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  const text = withoutMarkedValues(description).trim();
  return text === '' ? undefined : text;
}

/**
 * One file shown among a page's paragraphs: an image, an audio recording or
 * a video, as the protocol's assets say the file is (see protocol-validation's
 * `AssetBlock`). A file the protocol does not hold, one that is not something
 * a page can show, and one that fails to load each say that they are
 * unavailable, so a participant is never left with a gap they cannot explain.
 */
function AssetBlockView({ block }: { block: AssetBlock }) {
  const { isE2E } = useContractFlags();
  const assetManifest = useSelector(getAssetManifest);
  const assetMeta = assetManifest[block.assetId];
  const { url, isLoading } = useAssetUrl(block.assetId);
  const description = descriptionOf(block.description);
  const { size } = block;
  const align = block.align ?? ASSET_BLOCK_DEFAULTS.align;
  const autoplay = block.autoplay ?? ASSET_BLOCK_DEFAULTS.autoplay;
  const loop = block.loop ?? ASSET_BLOCK_DEFAULTS.loop;

  if (!assetMeta) {
    return (
      <Block>
        <ItemFallback />
      </Block>
    );
  }

  if (isLoading) {
    const sizeClass =
      assetMeta.type === 'image'
        ? cx(
            size === 'small' && 'min-h-48',
            size === 'medium' && 'min-h-96',
            size === 'large' && 'min-h-[60vh]',
          )
        : 'min-h-12';

    return (
      <Block className={cx('flex items-center justify-center', sizeClass)}>
        <Spinner />
      </Block>
    );
  }

  if (!url) {
    return (
      <Block>
        <ItemFallback />
      </Block>
    );
  }

  switch (assetMeta.type) {
    case 'image':
      return (
        <Block>
          <img
            src={url}
            alt={description ?? ''}
            className={cx(
              'size-full object-contain',
              getSizeClass(size),
              size !== undefined && getPositionClass(align),
            )}
          />
        </Block>
      );
    case 'audio':
      return (
        <Block className={cx('flex', getJustifyClass(align))}>
          {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- protocol assets carry no caption file (the asset schema has no field for one), so there is no track to point at. */}
          <audio
            controls
            autoPlay={autoplay}
            loop={loop}
            aria-label={description ?? 'Audio'}
            lang={description ? undefined : 'en'}
          >
            <source
              src={url}
              type={getMediaMimeType(
                assetMeta.source ?? assetMeta.name,
                'audio/mpeg',
              )}
            />
          </audio>
        </Block>
      );
    case 'video':
      return (
        <Block>
          <VideoPlayer
            src={url}
            name={assetMeta.name}
            description={description}
            source={assetMeta.source}
            isE2E={isE2E}
            size={size}
            align={align}
            autoplay={autoplay}
            loop={loop}
          />
        </Block>
      );
    case 'network':
    case 'geojson':
    case 'apikey':
      return (
        <Block>
          <ItemFallback />
        </Block>
      );
    default:
      return null;
  }
}

/** The block a markdown image names, drawn from its address and its text. */
function AssetBlockImage({ url, alt }: { url: string; alt: string }) {
  const reading = readAssetBlockUrl(url);
  if (reading === undefined) return null;
  return <AssetBlockView block={{ ...reading.block, description: alt }} />;
}

/**
 * Shows the files a page's markdown names as blocks: pass it to a markdown
 * renderer (`blockImages`) for text declared to hold them. An image naming
 * anything else, such as a picture on the web, is not shown, there as
 * anywhere else in an interview.
 */
export const assetBlockImages: MarkdownBlockImages = {
  matches: isAssetBlockUrl,
  Block: AssetBlockImage,
};
