export type Ratio = '1:1' | '4:3' | '16:9';

export type RatioConfig = {
  /** CSS-pixel viewport at capture time (multiplied by DEVICE_SCALE_FACTOR). */
  viewport: { width: number; height: number };
  /** Pixel widths of the shipped WebP variants, ascending. */
  widths: number[];
};

/**
 * Each ratio is captured at its own live viewport so the interface lays
 * itself out for that shape (the Shell switches orientation on
 * `max-aspect-ratio: 3/4`), rather than cropping one master.
 */
export const RATIOS: Record<Ratio, RatioConfig> = {
  '16:9': {
    viewport: { width: 1280, height: 720 },
    widths: [480, 960, 1440, 1920],
  },
  '4:3': {
    viewport: { width: 1024, height: 768 },
    widths: [320, 640, 960, 1280],
  },
  '1:1': { viewport: { width: 960, height: 960 }, widths: [320, 640, 960] },
};

export const ALL_RATIOS = Object.keys(RATIOS) as Ratio[];

export const DEVICE_SCALE_FACTOR = 2;

export const WEBP_QUALITY = 82;

/** Default extra settle time after network idle, ms (parameters.capture.delay). */
export const DEFAULT_DELAY_MS = 500;

/**
 * Churn guard: a regenerated variant only overwrites the committed one when
 * more than this fraction of pixels changed. Keeps visually-identical
 * regenerations from dirtying git.
 */
export const DIFF_THRESHOLD = 0.001;

/** Per-interface threshold overrides:
 *  - Geospatial: live map tiles drift between runs
 *  - Anonymisation: continuously-animating canvas background never settles */
export const DIFF_THRESHOLD_OVERRIDES: Record<string, number> = {
  Geospatial: 0.02,
  Anonymisation: 0.25,
};

/** A pixel counts as different when any channel deviates by more than this. */
export const PIXEL_TOLERANCE = 12;

/** File name for one generated variant. */
export const variantFileName = (
  interfaceName: string,
  ratio: Ratio,
  width: number,
) => `${interfaceName}.${ratio.replace(':', 'x')}.${width}.webp`;
