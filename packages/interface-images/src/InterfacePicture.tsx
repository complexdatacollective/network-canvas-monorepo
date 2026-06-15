import manifest, { type InterfaceType } from './generated/manifest';
import type { Ratio, RatioImages } from './types';

const DEFAULT_RATIO: Ratio = '16:9';
const RATIO_FALLBACK_ORDER: Ratio[] = ['16:9', '4:3', '1:1'];

const toSrcSet = (images: RatioImages) =>
  images.variants.map((v) => `${v.url} ${v.w}w`).join(', ');

const resolveRatio = (type: InterfaceType, ratio: Ratio): RatioImages => {
  const entry = manifest[type];
  const exact = entry[ratio];
  if (exact) return exact;
  // A capture story may restrict its ratios; fall back to the closest
  // available rather than rendering a broken image.
  for (const candidate of RATIO_FALLBACK_ORDER) {
    const images = entry[candidate];
    if (images) return images;
  }
  throw new Error(`No images generated for interface "${type}"`);
};

export type InterfacePictureProps = {
  /** Interface to display (manifest key, e.g. "Sociogram"). */
  type: InterfaceType;
  alt: string;
  /** Aspect ratio variant to render. Defaults to 16:9. */
  ratio?: Ratio;
  /**
   * The `sizes` attribute for the responsive sources — describe the
   * rendered width so the browser picks the smallest sufficient variant
   * (e.g. "(min-width: 64rem) 50vw, 100vw" or "14rem"). Defaults to 100vw.
   */
  sizes?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'auto';
  className?: string;
  /**
   * Optional art direction: earlier entries win. Each entry renders a
   * `<source media>` ahead of the base ratio, e.g.
   * `[{ media: '(max-width: 40rem)', ratio: '1:1' }]` to serve square
   * images on narrow screens.
   */
  artDirection?: Array<{ media: string; ratio: Ratio }>;
};

/**
 * Renders a generated interface screenshot as a responsive `<picture>`
 * element. The `<img>` fallback carries explicit width/height so the
 * browser reserves space before the image loads (no layout shift).
 */
const InterfacePicture = ({
  type,
  alt,
  ratio = DEFAULT_RATIO,
  sizes = '100vw',
  loading = 'lazy',
  fetchPriority,
  className,
  artDirection,
}: InterfacePictureProps) => {
  const base = resolveRatio(type, ratio);
  const largest = base.variants[base.variants.length - 1];
  if (!largest) {
    throw new Error(`No image variants for interface "${type}"`);
  }

  return (
    <picture>
      {artDirection?.map(({ media, ratio: directedRatio }) => (
        <source
          key={`${media}-${directedRatio}`}
          media={media}
          type="image/webp"
          srcSet={toSrcSet(resolveRatio(type, directedRatio))}
          sizes={sizes}
        />
      ))}
      <source type="image/webp" srcSet={toSrcSet(base)} sizes={sizes} />
      <img
        src={largest.url}
        width={largest.w}
        height={largest.h}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        className={className}
      />
    </picture>
  );
};

export default InterfacePicture;
