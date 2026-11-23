import { describe, expect, it } from 'vitest';

import { SETTINGS_OFFSET, settingsPlacement } from '../settingsPlacement.ts';

describe('where a block’s settings stand', () => {
  // Where they may stand in a window 1000 pixels tall, its host's bars and
  // the space kept clear of them left out.
  const ROOM = { top: 96, bottom: 910 };
  const TALL = 450;
  // A file 192 pixels tall whose top is at `top`.
  const fileAt = (top: number) => ({ top, bottom: top + 192 });
  // The file whose settings just fit under it, and the one whose settings
  // just fit over it.
  const fitsUnder = fileAt(ROOM.bottom - SETTINGS_OFFSET - TALL - 192);
  const fitsOver = fileAt(ROOM.top + SETTINGS_OFFSET + TALL);

  it('stand under the file where they fit there', () => {
    expect(settingsPlacement(fitsUnder, TALL, ROOM)).toEqual({
      side: 'bottom',
      overlaps: false,
    });
    // A pixel lower, they no longer do.
    expect(
      settingsPlacement(fileAt(fitsUnder.top + 1), TALL, ROOM).overlaps,
    ).toBe(true);
  });

  it('stand over the file where they fit only there', () => {
    expect(settingsPlacement(fitsOver, TALL, ROOM)).toEqual({
      side: 'top',
      overlaps: false,
    });
    // A pixel higher, they no longer do.
    expect(
      settingsPlacement(fileAt(fitsOver.top - 1), TALL, ROOM).overlaps,
    ).toBe(true);
  });

  it('cover the file from the side with more room where they fit on neither', () => {
    // Halfway between, there is as much room under the file as over it.
    const halfway = (fitsUnder.top + fitsOver.top) / 2;
    expect(settingsPlacement(fileAt(halfway - 1), TALL, ROOM)).toEqual({
      side: 'bottom',
      overlaps: true,
    });
    expect(settingsPlacement(fileAt(halfway + 1), TALL, ROOM)).toEqual({
      side: 'top',
      overlaps: true,
    });
  });

  it('measure the room from where it starts', () => {
    // Where the room starts a pixel lower, as it does below a banner, the
    // settings that just fitted over the file no longer do.
    expect(
      settingsPlacement(fitsOver, TALL, { ...ROOM, top: ROOM.top + 1 }),
    ).toEqual({ side: 'top', overlaps: true });
  });
});
