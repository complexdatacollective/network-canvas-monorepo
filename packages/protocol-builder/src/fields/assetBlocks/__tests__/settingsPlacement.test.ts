import { describe, expect, it } from 'vitest';

import { POPOVER_ARROW_PADDING } from '@codaco/fresco-ui/popoverArrow';

import {
  type Box,
  KEEP_OUT_CLEARANCE,
  PLAYER_CONTROLS_HEIGHT,
  SETTINGS_OFFSET,
  settingsKeptOn,
  settingsPlacement,
} from '../settingsPlacement.ts';

type Placement = ReturnType<typeof settingsPlacement>;
type Size = Readonly<{ wide: number; tall: number }>;

// Where they may stand in a window 1000 pixels tall and 1440 wide, its host's
// bars and the space kept clear of them left out.
const ROOM: Box = { top: 96, bottom: 910, left: 0, right: 1440 };
const SETTINGS: Size = { wide: 360, tall: 450 };

// A settings button 40 pixels square whose top is at `top`, its end at
// `end`: in a block's tab, at the end of the block's first line.
const BUTTON = 40;

// The popover keeps the middle of its arrow, 20 pixels wide, this far in
// from a corner of the settings, and moves them along to keep it so.
const ARROW_INSET = POPOVER_ARROW_PADDING + 10;
const buttonAt = (top: number, end = 900, direction = 'ltr'): Box =>
  direction === 'rtl'
    ? { top, bottom: top + BUTTON, left: end, right: end + BUTTON }
    : { top, bottom: top + BUTTON, left: end - BUTTON, right: end };

/**
 * Where the popover draws settings placed by `placement`: under or over the
 * button lined up with its end, beside it lined up with its top, each moved
 * along to stay inside the placement's room; cut short to the room where they
 * scroll (Base UI's `shift` and `size`, as the view asks for them).
 */
const drawnAt = (
  placement: Placement,
  button: Box,
  settings: Size,
  direction: 'ltr' | 'rtl' = 'ltr',
): Box => {
  const { room, side } = placement;
  const wide = Math.min(settings.wide, room.right - room.left);
  const clamp = (value: number, low: number, high: number) =>
    Math.max(low, Math.min(value, high));
  const across = (button.left + button.right) / 2;
  if (side === 'bottom' || side === 'top') {
    const end =
      direction === 'rtl'
        ? Math.min(button.left, across - ARROW_INSET) + wide
        : Math.max(button.right, across + ARROW_INSET);
    const left = clamp(end - wide, room.left, room.right - wide);
    const top =
      side === 'bottom'
        ? button.bottom + SETTINGS_OFFSET
        : button.top - SETTINGS_OFFSET - settings.tall;
    if (!placement.scrolls) {
      return { top, bottom: top + settings.tall, left, right: left + wide };
    }
    // Cut short to the room on their side of the button.
    return side === 'bottom'
      ? {
          top,
          bottom: Math.min(top + settings.tall, room.bottom),
          left,
          right: left + wide,
        }
      : {
          top: Math.max(top, room.top),
          bottom: button.top - SETTINGS_OFFSET,
          left,
          right: left + wide,
        };
  }
  const onTheRight = (side === 'end') === (direction === 'ltr');
  const left = onTheRight
    ? button.right + SETTINGS_OFFSET
    : button.left - SETTINGS_OFFSET - wide;
  const middle = (button.top + button.bottom) / 2;
  const top = clamp(
    Math.min(button.top, middle - ARROW_INSET),
    room.top,
    room.bottom - settings.tall,
  );
  return { top, bottom: top + settings.tall, left, right: left + wide };
};

/** How far apart two boxes are: 0 where they touch or overlap. */
const distanceBetween = (one: Box, other: Box): number =>
  Math.hypot(
    Math.max(other.left - one.right, one.left - other.right, 0),
    Math.max(other.top - one.bottom, one.top - other.bottom, 0),
  );

const inside = (box: Box, room: Box) =>
  box.top >= room.top &&
  box.bottom <= room.bottom &&
  box.left >= room.left &&
  box.right <= room.right;

describe('where a block’s settings stand beside its settings button', () => {
  // The button whose settings just fit under it, and the one whose settings
  // just fit over it.
  const fitsUnder = ROOM.bottom - SETTINGS_OFFSET - SETTINGS.tall - BUTTON;
  const fitsOver = ROOM.top + SETTINGS_OFFSET + SETTINGS.tall;

  it('stand below the button where they fit there', () => {
    expect(settingsPlacement(buttonAt(fitsUnder), SETTINGS, ROOM)).toEqual({
      side: 'bottom',
      room: ROOM,
      scrolls: false,
    });
    // A pixel lower, they no longer do.
    expect(
      settingsPlacement(buttonAt(fitsUnder + 1), SETTINGS, ROOM).side,
    ).not.toBe('bottom');
  });

  it('stand above the button where they fit only there', () => {
    expect(settingsPlacement(buttonAt(fitsOver), SETTINGS, ROOM)).toEqual({
      side: 'top',
      room: ROOM,
      scrolls: false,
    });
    // A pixel higher, they fit on neither, and stand at the end of the line.
    expect(
      settingsPlacement(buttonAt(fitsOver - 1, 900), SETTINGS, ROOM).side,
    ).toBe('end');
  });

  it('stand at the end of the line, then at its start, where they fit neither below nor above', () => {
    const tall: Size = { wide: 360, tall: 700 };
    expect(settingsPlacement(buttonAt(300, 900), tall, ROOM)).toMatchObject({
      side: 'end',
      scrolls: false,
    });
    // At the right of the window, there is no room at the end.
    expect(
      settingsPlacement(buttonAt(300, ROOM.right - 10), tall, ROOM),
    ).toMatchObject({ side: 'start', scrolls: false });
    // In right-to-left text the end of the line is on the left.
    expect(
      settingsPlacement(buttonAt(300, 10, 'rtl'), tall, ROOM, [], 'rtl'),
    ).toMatchObject({ side: 'start', scrolls: false });
    expect(
      settingsPlacement(buttonAt(300, 900, 'rtl'), tall, ROOM, [], 'rtl'),
    ).toMatchObject({ side: 'end', scrolls: false });
  });

  it('measure the room from where it starts', () => {
    // Where the room starts a pixel lower, as it does below a banner, the
    // settings that just fitted over the button no longer do.
    expect(
      settingsPlacement(buttonAt(fitsOver), SETTINGS, {
        ...ROOM,
        top: ROOM.top + 1,
      }).side,
    ).not.toBe('top');
  });

  it('are cut short and scrolled within, where they fit on no side, on the side with more room', () => {
    const huge: Size = { wide: 1400, tall: 900 };
    // Below a button high in the room.
    expect(settingsPlacement(buttonAt(300), huge, ROOM)).toEqual({
      side: 'bottom',
      room: ROOM,
      scrolls: true,
    });
    // Above a button low in it, with no room under it at all.
    expect(
      settingsPlacement(buttonAt(ROOM.bottom - BUTTON), huge, ROOM),
    ).toEqual({ side: 'top', room: ROOM, scrolls: true });
  });
});

// A block's file, and what of it the settings never cover, as a view draws
// them: the button in its tab, 10 pixels in from the file's end and over its
// top; the corner that resizes a picture, 24 pixels square, its middle 3
// pixels out from the bottom corner on the side the picture grows towards;
// and the bar of controls along the bottom of a video.
const CORNER_SIZE = 24;
const CORNER_OUT = 3;

const blockAt = (
  file: Box,
  kind: 'picture' | 'video' | 'audio',
  direction: 'ltr' | 'rtl' = 'ltr',
) => {
  const tabTop = file.top - 38;
  const button =
    direction === 'rtl'
      ? buttonAt(tabTop, file.left + 18, 'rtl')
      : buttonAt(tabTop, file.right - 18);
  const x =
    direction === 'rtl' ? file.left - CORNER_OUT : file.right + CORNER_OUT;
  const y = file.bottom + CORNER_OUT;
  const corner: Box = {
    top: y - CORNER_SIZE / 2,
    bottom: y + CORNER_SIZE / 2,
    left: x - CORNER_SIZE / 2,
    right: x + CORNER_SIZE / 2,
  };
  const keepOut: Box[] = [corner];
  if (kind === 'video') {
    keepOut.push({ ...file, top: file.bottom - PLAYER_CONTROLS_HEIGHT });
  }
  if (kind === 'audio') keepOut.push(file);
  return { button, keepOut };
};

describe('a block’s settings and the parts of the block they never cover', () => {
  // A video 192 pixels tall whose bar of controls the settings would cover
  // under the button, in a window that leaves room beside the block.
  const file: Box = { top: 200, bottom: 392, left: 446, right: 1000 };

  it('skip a side where they would cover the bar of a video’s controls', () => {
    // A video lower on the page, with room for its settings under the
    // button and over it.
    const lower: Box = { top: 500, bottom: 692, left: 446, right: 1000 };
    const short: Size = { wide: 360, tall: 300 };
    const { button, keepOut } = blockAt(lower, 'video');
    // Without the bar to keep clear of, they stand below the button.
    expect(settingsPlacement(button, short, ROOM).side).toBe('bottom');
    // Below the button, they would cover the bar: they stand above it.
    const placement = settingsPlacement(button, short, ROOM, keepOut);
    expect(placement).toEqual({ side: 'top', room: ROOM, scrolls: false });
    const drawn = drawnAt(placement, button, short);
    for (const part of keepOut) {
      expect(distanceBetween(drawn, part)).toBeGreaterThanOrEqual(
        SETTINGS_OFFSET,
      );
    }
  });

  it('stop short of what they never cover, and scroll, where every side would cover it', () => {
    // The page no wider than the block, and no room above the tab: no side
    // is clear of the corner and the controls.
    const narrow: Box = { top: 150, bottom: 700, left: 440, right: 1010 };
    const { button, keepOut } = blockAt(file, 'video');
    const placement = settingsPlacement(button, SETTINGS, narrow, keepOut);
    expect(placement).toMatchObject({ side: 'bottom', scrolls: true });
    const controlsTop = file.bottom - PLAYER_CONTROLS_HEIGHT;
    expect(placement.room.bottom).toBe(controlsTop - KEEP_OUT_CLEARANCE);
    const drawn = drawnAt(placement, button, SETTINGS);
    for (const part of keepOut) {
      expect(distanceBetween(drawn, part)).toBeGreaterThanOrEqual(
        KEEP_OUT_CLEARANCE,
      );
    }
  });

  // Every place in the window, every block width and height, each kind of
  // file and each direction, and settings as wide as a block or much
  // narrower.
  it('never cover the corner or a player’s controls, wherever the block is and whatever its size', () => {
    const misses: string[] = [];
    const pages: readonly Box[] = [
      { top: 72, bottom: 642, left: 0, right: 1280 },
      { top: 72, bottom: 642, left: 400, right: 880 },
    ];
    for (const settings of [
      { wide: 724, tall: 480 },
      { wide: 360, tall: 300 },
    ]) {
      for (const page of pages) {
        for (let wide = 200; wide <= 1200; wide += 100) {
          for (let tall = 60; tall <= 560; tall += 50) {
            for (let top = -tall; top <= 720; top += 15) {
              for (const kind of ['picture', 'video', 'audio'] as const) {
                for (const direction of ['ltr', 'rtl'] as const) {
                  const left = (page.left + page.right - wide) / 2;
                  const { button, keepOut } = blockAt(
                    { top, bottom: top + tall, left, right: left + wide },
                    kind,
                    direction,
                  );
                  const placement = settingsPlacement(
                    button,
                    settings,
                    page,
                    keepOut,
                    direction,
                  );
                  const drawn = drawnAt(placement, button, settings, direction);
                  const near = Math.min(
                    ...keepOut.map((part) => distanceBetween(drawn, part)),
                  );
                  const fits = placement.scrolls || inside(drawn, page);
                  if (near < SETTINGS_OFFSET - 0.01 || !fits) {
                    misses.push(
                      `${JSON.stringify({ settings, page, wide, tall, top, kind, direction })} → ${JSON.stringify(placement)}`,
                    );
                  }
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

describe('a block’s settings as they change height', () => {
  it('stay on their side, grow away from the button and scroll within, rather than moving', () => {
    const button = buttonAt(400);
    const tall: Size = { wide: 360, tall: 2000 };
    for (const side of ['bottom', 'end', 'start'] as const) {
      const kept = settingsKeptOn(side, button, tall, ROOM, [], 'ltr', 300);
      expect(kept.side).toBe(side);
      expect(kept.scrolls).toBe(true);
      // Beside the button, the room starts at their top, which stays put.
      expect(kept.room.top).toBe(side === 'bottom' ? ROOM.top : 300);
      expect(kept.room.bottom).toBe(ROOM.bottom);
    }
    expect(settingsKeptOn('top', button, tall, ROOM)).toMatchObject({
      side: 'top',
      scrolls: true,
      room: ROOM,
    });
  });

  it('stop short of what they never cover below them', () => {
    const button = buttonAt(200);
    const corner: Box = { top: 600, bottom: 620, left: 860, right: 880 };
    const kept = settingsKeptOn('bottom', button, SETTINGS, ROOM, [corner]);
    expect(kept.room.bottom).toBe(corner.top - KEEP_OUT_CLEARANCE);
    expect(kept.scrolls).toBe(true);
  });
});
