/**
 * Normalize an imported image to a URL string.
 *
 * A static image import resolves differently per bundler: Vite types it as the
 * URL `string`, while Next.js types it as a `StaticImageData` object carrying
 * the URL on `.src`. Consumers of this package compile its source with their
 * own bundler, so code that passes an imported image to `<img src>` must accept
 * both shapes or it fails to typecheck in one host or the other.
 */
export const imageUrl = (imported: string | { src: string }): string =>
  typeof imported === 'string' ? imported : imported.src;
