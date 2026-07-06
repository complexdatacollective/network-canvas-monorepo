import manifest from '@codaco/interface-images/manifest';

import Default from './stage--Default.webp';

/**
 * Placeholder for stage types that have no generated screenshot in
 * @codaco/interface-images (e.g. types not yet implemented in the
 * interview package). Dimensions must match the file.
 */
export const defaultStageImage = { src: Default, width: 448, height: 307 };

/** The timeline renders stage thumbnails at w-56 (224px), i.e. 448px at 2x. */
const PRELOAD_TARGET_WIDTH = 448;

/**
 * Warm the browser cache for the stage-thumbnail variants the timeline and
 * stage editor render, so they appear immediately on first navigation.
 */
export const preloadTimelineImages = () => {
  for (const entry of Object.values(manifest)) {
    const variants = entry['4:3']?.variants;
    if (!variants?.length) continue;
    const target =
      variants.find((v) => v.w >= PRELOAD_TARGET_WIDTH) ??
      variants[variants.length - 1];
    if (target) {
      const img = new Image();
      img.src = target.url;
    }
  }
  const img = new Image();
  img.src = defaultStageImage.src;
};
