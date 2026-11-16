import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from 'vitest';

// Captures are rounded to whole pixels, so a 7:5 frame holds 2836x2002.
const TOLERANCE = 0.02;

function pngAspectRatio(src: string) {
  const bytes = readFileSync(join(process.cwd(), 'public', src));
  // A PNG's IHDR chunk holds the width and height as big-endian integers.
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${src} is not a PNG`);
  }
  return bytes.readUInt32BE(16) / bytes.readUInt32BE(20);
}

function frameAspectRatio(frame: Element) {
  const match = /(?:^|\s)aspect-(\d+)\/(\d+)(?:\s|$)/.exec(
    frame.getAttribute('class') ?? '',
  );
  if (!match) throw new Error('The screenshot frame declares no aspect ratio');
  return Number(match[1]) / Number(match[2]);
}

/**
 * The frame's declared ratio must be the screenshot file's own, or the
 * contained image is letterboxed inside it.
 */
export function expectFrameToMatchScreenshot(image: HTMLElement) {
  const src = image.getAttribute('src');
  const frame = image.parentElement;
  if (!src || !frame) throw new Error('The screenshot has no source or frame');

  const ratio = frameAspectRatio(frame) / pngAspectRatio(src);
  expect(Math.abs(ratio - 1), src).toBeLessThan(TOLERANCE);
}
