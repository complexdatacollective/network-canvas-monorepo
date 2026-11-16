'use client';

import type { CSSProperties } from 'react';
import { useSyncExternalStore } from 'react';

import { cn } from '~/lib/cn';

// Institution logos arrive as PNGs with very different amounts of transparent
// padding (one wordmark fills a fifth of its canvas), so laying them out by
// their file boxes makes them look wildly different in size. This measures each
// logo's inked area once, in the browser, then crops to it and sizes the
// result by an optical rule: wide marks get more width and less height, square
// marks the reverse, so every logo carries a similar visual weight.

type LogoBounds = {
  // Fractions of the natural image size.
  x: number;
  y: number;
  w: number;
  h: number;
  // Aspect ratio (width / height) of the inked area, in pixels.
  ratio: number;
};

type LogoEntry = LogoBounds | 'failed';

const entries = new Map<string, LogoEntry>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

const SAMPLE_WIDTH = 480;
const ALPHA_FLOOR = 16;
const WHITE_FLOOR = 246;

function notify() {
  for (const listener of listeners) listener();
}

function measure(src: string) {
  if (entries.has(src) || pending.has(src)) return;
  pending.add(src);

  const image = new Image();
  image.decoding = 'async';
  const onLoad = () => {
    pending.delete(src);
    try {
      const scale = Math.min(1, SAMPLE_WIDTH / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('no 2d context');
      context.drawImage(image, 0, 0, width, height);
      const { data } = context.getImageData(0, 0, width, height);

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const alpha = data[offset + 3] ?? 0;
          if (alpha < ALPHA_FLOOR) continue;
          const isPaper =
            (data[offset] ?? 0) > WHITE_FLOOR &&
            (data[offset + 1] ?? 0) > WHITE_FLOOR &&
            (data[offset + 2] ?? 0) > WHITE_FLOOR;
          if (isPaper) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX || maxY < minY) throw new Error('blank logo');

      const inkWidth = maxX - minX + 1;
      const inkHeight = maxY - minY + 1;
      entries.set(src, {
        x: minX / width,
        y: minY / height,
        w: inkWidth / width,
        h: inkHeight / height,
        ratio: inkWidth / inkHeight,
      });
    } catch {
      entries.set(src, 'failed');
    }
    notify();
  };
  const onError = () => {
    pending.delete(src);
    entries.set(src, 'failed');
    notify();
  };
  image.addEventListener('load', onLoad, { once: true });
  image.addEventListener('error', onError, { once: true });
  image.src = src;
}

function useLogoEntry(src: string): LogoEntry | undefined {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      measure(src);
      return () => listeners.delete(onChange);
    },
    () => entries.get(src),
    () => undefined,
  );
}

// Width grows with the mark's aspect ratio raised to this power. 0.5 would
// hold the inked area constant; a little more lets long wordmarks keep
// legible letter heights.
const WIDTH_EXPONENT = 0.62;
const FALLBACK_RATIO = 16 / 9;

type GrantLogoProps = {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * An institution logo cropped to its inked area and sized optically. Set the
 * `--logo-size` custom property (a length) on it or an ancestor to scale it;
 * it never grows wider than its container.
 */
export function GrantLogo({ src, alt, className, style }: GrantLogoProps) {
  const entry = useLogoEntry(src);
  const bounds = entry && entry !== 'failed' ? entry : undefined;
  const ratio = bounds?.ratio ?? FALLBACK_RATIO;

  return (
    <span
      className={cn(
        'relative block max-w-full shrink-0 overflow-hidden',
        className,
      )}
      style={{
        aspectRatio: ratio,
        width: `calc(var(--logo-size, 5rem) * ${Math.pow(ratio, WIDTH_EXPONENT).toFixed(3)})`,
        ...style,
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn(
          'absolute max-w-none transition-opacity duration-300',
          bounds ? 'opacity-100' : 'size-full object-contain',
          entry === undefined && 'opacity-0',
        )}
        style={
          bounds
            ? {
                width: `${100 / bounds.w}%`,
                left: `${(-bounds.x / bounds.w) * 100}%`,
                top: `${(-bounds.y / bounds.h) * 100}%`,
              }
            : undefined
        }
      />
    </span>
  );
}
