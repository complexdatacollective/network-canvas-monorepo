import { type RefObject, useLayoutEffect, useState } from 'react';

/** Where the file itself is drawn, inside the box its block draws it in. */
export type DrawnFile = Readonly<{
  /** Where it is drawn, from the box's top left corner. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** A picture's width over its height; `undefined` for an audio player. */
  ratio: number | undefined;
}>;

export const hasRatio = (
  drawn: DrawnFile,
): drawn is DrawnFile & { ratio: number } => drawn.ratio !== undefined;

const sameDrawing = (
  one: DrawnFile | undefined,
  other: DrawnFile | undefined,
): boolean =>
  one === other ||
  (one !== undefined &&
    other !== undefined &&
    one.left === other.left &&
    one.top === other.top &&
    one.width === other.width &&
    one.height === other.height &&
    one.ratio === other.ratio);

/**
 * Where `box` draws its file. An image or video held to a height is drawn
 * inside an element as wide as the page, so its picture is narrower than its
 * element, and sits in the middle of it. Nothing
 * until the file has said how large it is.
 */
const drawnFileIn = (box: HTMLElement): DrawnFile | undefined => {
  const media = box.querySelector('img, video, audio');
  if (media === null) return undefined;
  const outer = box.getBoundingClientRect();
  const element = media.getBoundingClientRect();
  if (media instanceof HTMLAudioElement) {
    return {
      left: element.left - outer.left,
      top: element.top - outer.top,
      width: element.width,
      height: element.height,
      ratio: undefined,
    };
  }
  const [naturalWidth, naturalHeight] =
    media instanceof HTMLImageElement
      ? [media.naturalWidth, media.naturalHeight]
      : media instanceof HTMLVideoElement
        ? [media.videoWidth, media.videoHeight]
        : [0, 0];
  if (naturalWidth === 0 || naturalHeight === 0 || element.height === 0) {
    return undefined;
  }
  const ratio = naturalWidth / naturalHeight;
  const width = Math.min(element.width, element.height * ratio);
  const height = width / ratio;
  // Drawn whole in the middle of its element (`object-contain`).
  return {
    left: element.left - outer.left + (element.width - width) / 2,
    top: element.top - outer.top + (element.height - height) / 2,
    width,
    height,
    ratio,
  };
};

/**
 * Where the box `ref` names draws its file, kept up as the box changes size
 * and as the file arrives.
 */
export function useDrawnFile(
  ref: RefObject<HTMLDivElement | null>,
): DrawnFile | undefined {
  const [drawn, setDrawn] = useState<DrawnFile | undefined>(undefined);
  useLayoutEffect(() => {
    const box = ref.current;
    if (box === null) return undefined;
    const measure = () => {
      const next = drawnFileIn(box);
      setDrawn((current) => (sameDrawing(current, next) ? current : next));
    };
    measure();
    // A file says how large it is when it loads, and neither event bubbles.
    box.addEventListener('load', measure, true);
    box.addEventListener('loadedmetadata', measure, true);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(box);
    return () => {
      box.removeEventListener('load', measure, true);
      box.removeEventListener('loadedmetadata', measure, true);
      observer?.disconnect();
    };
  });
  return drawn;
}
