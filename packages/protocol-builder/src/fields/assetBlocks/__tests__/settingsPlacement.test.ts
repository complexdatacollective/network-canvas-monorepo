import { describe, expect, it } from 'vitest';

import { SETTINGS_OFFSET, settingsPlacement } from '../settingsPlacement.ts';

type Box = Readonly<{
  top: number;
  bottom: number;
  left: number;
  right: number;
}>;

type Placement = ReturnType<typeof settingsPlacement>;

// Where they may stand in a window 1000 pixels tall and 1440 wide, its host's
// bars and the space kept clear of them left out.
const ROOM: Box = { top: 96, bottom: 910, left: 0, right: 1440 };
const SETTINGS = { wide: 700, tall: 450 } as const;

describe('where a block’s settings stand', () => {
  const TALL = SETTINGS.tall;
  // A file 192 pixels tall whose top is at `top`, in the middle of the page.
  const fileAt = (top: number): Box => ({
    top,
    bottom: top + 192,
    left: 620,
    right: 812,
  });
  // The file whose settings just fit under it, and the one whose settings
  // just fit over it.
  const fitsUnder = fileAt(ROOM.bottom - SETTINGS_OFFSET - TALL - 192);
  const fitsOver = fileAt(ROOM.top + SETTINGS_OFFSET + TALL);
  const sideOf = (placement: Placement) => ({
    side: placement.side,
    overlaps: placement.overlaps,
  });

  it('stand under the file where they fit there', () => {
    expect(settingsPlacement(fitsUnder, SETTINGS, ROOM)).toEqual({
      side: 'bottom',
      overlaps: false,
      offset: SETTINGS_OFFSET,
      room: ROOM,
    });
    // A pixel lower, they no longer do.
    expect(
      settingsPlacement(fileAt(fitsUnder.top + 1), SETTINGS, ROOM).overlaps,
    ).toBe(true);
  });

  it('stand over the file where they fit only there', () => {
    expect(settingsPlacement(fitsOver, SETTINGS, ROOM)).toEqual({
      side: 'top',
      overlaps: false,
      offset: SETTINGS_OFFSET,
      room: ROOM,
    });
    // A pixel higher, they no longer do.
    expect(
      settingsPlacement(fileAt(fitsOver.top - 1), SETTINGS, ROOM).overlaps,
    ).toBe(true);
  });

  it('cover the file from the side with more room where they fit on neither', () => {
    // Halfway between, there is as much room under the file as over it.
    const halfway = (fitsUnder.top + fitsOver.top) / 2;
    expect(
      sideOf(settingsPlacement(fileAt(halfway - 1), SETTINGS, ROOM)),
    ).toEqual({ side: 'bottom', overlaps: true });
    expect(
      sideOf(settingsPlacement(fileAt(halfway + 1), SETTINGS, ROOM)),
    ).toEqual({ side: 'top', overlaps: true });
  });

  it('measure the room from where it starts', () => {
    // Where the room starts a pixel lower, as it does below a banner, the
    // settings that just fitted over the file no longer do.
    expect(
      sideOf(
        settingsPlacement(fitsOver, SETTINGS, { ...ROOM, top: ROOM.top + 1 }),
      ),
    ).toEqual({ side: 'top', overlaps: true });
  });
});

// A block's box, and the picture and resize corner drawn in it, as a view
// draws them: the picture as tall as the box and held against its left, its
// middle or its right (`across`), and the corner 24 pixels square, its
// middle 5 pixels out from the bottom corner of the box on the side the
// picture grows towards.
const CORNER_SIZE = 24;
const CORNER_OUT = 5;

const pictureIn = (box: Box, across: 0 | 0.5 | 1, ratio = 1) => {
  const tall = box.bottom - box.top;
  const wide = Math.min(box.right - box.left, tall * ratio);
  const left = box.left + (box.right - box.left - wide) * across;
  const file: Box = { ...box, left, right: left + wide };
  const x = across === 1 ? box.left - CORNER_OUT : box.right + CORNER_OUT;
  const y = box.bottom + CORNER_OUT;
  const corner: Box = {
    top: y - CORNER_SIZE / 2,
    bottom: y + CORNER_SIZE / 2,
    left: x - CORNER_SIZE / 2,
    right: x + CORNER_SIZE / 2,
  };
  return { file, corner };
};

/**
 * Where the popover draws settings `wide` and `tall` placed by `placement`:
 * centred on the file and moved across to stay inside the placement's room;
 * beside the file at its offset, no taller than the room left there; or,
 * where they may cover it, moved over it to stay inside the room, and no
 * taller than it (Base UI's `shift` and `size`, as the view asks for them).
 */
const drawnAt = (
  placement: Placement,
  file: Box,
  settings: Readonly<{ wide: number; tall: number }>,
): Box => {
  const { room, offset } = placement;
  const left = Math.max(
    Math.min(
      (file.left + file.right - settings.wide) / 2,
      room.right - settings.wide,
    ),
    room.left,
  );
  const across = { left, right: left + settings.wide };
  if (!placement.overlaps) {
    return placement.side === 'bottom'
      ? {
          ...across,
          top: file.bottom + offset,
          bottom: Math.min(file.bottom + offset + settings.tall, room.bottom),
        }
      : {
          ...across,
          top: Math.max(file.top - offset - settings.tall, room.top),
          bottom: file.top - offset,
        };
  }
  const shown = Math.min(settings.tall, room.bottom - room.top);
  const natural =
    placement.side === 'bottom'
      ? file.bottom + offset
      : file.top - offset - shown;
  const top = Math.max(room.top, Math.min(natural, room.bottom - shown));
  return { ...across, top, bottom: top + shown };
};

/** How far apart two boxes are: 0 where they touch or overlap. */
const distanceBetween = (one: Box, other: Box): number =>
  Math.hypot(
    Math.max(other.left - one.right, one.left - other.right, 0),
    Math.max(other.top - one.bottom, one.top - other.bottom, 0),
  );

describe('a block’s settings and the corner that resizes its picture', () => {
  // A square picture 432 pixels tall in a box 712 wide, its corner on the
  // right, in a window 1280 wide whose page leaves room either side.
  const ROOM_1280: Box = { top: 72, bottom: 642, left: 0, right: 1280 };
  const boxAt = (top: number, left = 446, wide = 712, tall = 432): Box => ({
    top,
    bottom: top + tall,
    left,
    right: left + wide,
  });
  const WIDE = { wide: 724, tall: 480 } as const;

  it('stand far enough under the file to leave the corner below it uncovered', () => {
    const { file, corner } = pictureIn(
      { top: 100, bottom: 292, left: 446, right: 1158 },
      0.5,
      4,
    );
    const placement = settingsPlacement(file, WIDE, ROOM, corner);
    expect(placement).toMatchObject({ side: 'bottom', overlaps: false });
    expect(placement.offset).toBe(
      corner.bottom + SETTINGS_OFFSET - file.bottom,
    );
    expect(
      distanceBetween(drawnAt(placement, file, WIDE), corner),
    ).toBeGreaterThanOrEqual(SETTINGS_OFFSET);
  });

  it('stand their usual distance under a file whose corner they are nowhere near', () => {
    const { file, corner } = pictureIn(
      { top: 100, bottom: 292, left: 200, right: 1300 },
      0,
    );
    expect(settingsPlacement(file, WIDE, ROOM, corner).offset).toBe(
      SETTINGS_OFFSET,
    );
  });

  it('over the file, keep beside the corner on the side the file is on', () => {
    // Near the middle of the window, the settings fit neither under the
    // picture nor over it, and there is more room under it: moved up over
    // it, they would come to its bottom, where the corner is.
    for (const across of [0, 0.5, 1] as const) {
      const { file, corner } = pictureIn(boxAt(130), across);
      const placement = settingsPlacement(file, WIDE, ROOM_1280, corner);
      expect(placement.overlaps).toBe(true);
      const drawn = drawnAt(placement, file, WIDE);
      if (across === 1) {
        expect(drawn.left).toBeGreaterThanOrEqual(
          corner.right + SETTINGS_OFFSET,
        );
      } else {
        expect(drawn.right).toBeLessThanOrEqual(corner.left - SETTINGS_OFFSET);
      }
      // Still the whole of them, no less tall for it.
      expect(drawn.bottom - drawn.top).toBe(WIDE.tall);
    }
  });

  it('stand above the corner, or under it, where they are too wide to stand beside it', () => {
    // The page no wider than the block, so there is no room beside the
    // corner for them.
    const narrow = { ...ROOM_1280, left: 446, right: 1158 + 17 };
    const high = pictureIn(boxAt(130), 0.5);
    const above = settingsPlacement(high.file, WIDE, narrow, high.corner);
    expect(above).toMatchObject({ side: 'top', overlaps: true });
    expect(above.room.bottom).toBe(high.corner.top - SETTINGS_OFFSET);

    // A picture whose corner is near the top of the window has more room
    // under the corner than over it.
    const low = pictureIn(boxAt(-300), 0.5);
    const under = settingsPlacement(low.file, WIDE, narrow, low.corner);
    expect(under).toMatchObject({ side: 'bottom', overlaps: false });
    expect(under.offset).toBe(
      low.corner.bottom + SETTINGS_OFFSET - low.file.bottom,
    );
  });

  // Every place in the window, every block width and height, each side the
  // picture is held to, and settings as wide as a block or much narrower.
  it('leave the corner uncovered wherever the block is, and whatever its size', () => {
    const misses: string[] = [];
    for (const settings of [WIDE, { wide: 360, tall: 300 }]) {
      for (const page of [ROOM_1280, { ...ROOM_1280, left: 400, right: 880 }]) {
        for (let wide = 200; wide <= 1200; wide += 100) {
          for (let tall = 60; tall <= 560; tall += 50) {
            for (let top = -tall; top <= 720; top += 15) {
              for (const across of [0, 0.5, 1] as const) {
                const left = (page.left + page.right - wide) / 2;
                const { file, corner } = pictureIn(
                  boxAt(top, left, wide, tall),
                  across,
                );
                const placement = settingsPlacement(
                  file,
                  settings,
                  page,
                  corner,
                );
                const near = distanceBetween(
                  drawnAt(placement, file, settings),
                  corner,
                );
                if (near < SETTINGS_OFFSET - 0.01) {
                  misses.push(
                    `${JSON.stringify({ settings, page, wide, tall, top, across })} → ${JSON.stringify(placement)}`,
                  );
                }
              }
            }
          }
        }
      }
    }
    expect(misses.slice(0, 5)).toEqual([]);
  });
});
