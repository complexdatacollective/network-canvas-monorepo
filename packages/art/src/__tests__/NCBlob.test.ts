import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_INITIAL_OFFSCREEN_LEAD_SECONDS,
  NCBlob,
} from '../BackgroundBlobs/NCBlob';

const palette = [['#ff0000', '#00ff00']] as const;

const mockRandomSequence = (values: number[]) => {
  const spy = vi.spyOn(Math, 'random');
  spy.mockReset();
  values.forEach((value) => {
    spy.mockReturnValueOnce(value);
  });
  spy.mockReturnValue(0);
};

describe('NCBlob', () => {
  beforeEach(() => {
    // Determinism: fixes random size buckets, gradient picks, angle.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initialises layer 1 with a non-zero randomised speed', () => {
      const blob = new NCBlob(1, 1, palette);
      expect(blob.layer).toBe(1);
      expect(blob.speed).toBeGreaterThan(0);
      expect(blob.firstRender).toBe(true);
      expect(blob.lastUpdate).toBeNull();
      expect(blob.animation).toBeNull();
      expect(blob.cachedGradient).toBeNull();
    });

    it('initialises layer 2 with a positive randomised speed', () => {
      const blob = new NCBlob(2, 1, palette);
      expect(blob.layer).toBe(2);
      expect(blob.speed).toBeGreaterThan(0);
    });

    it('uses a fixed speed of 0.5 for layer 3', () => {
      const blob = new NCBlob(3, 1, palette);
      expect(blob.layer).toBe(3);
      expect(blob.speed).toBe(0.5);
    });

    it('scales speed by the speedFactor', () => {
      const blob1 = new NCBlob(3, 1, palette);
      const blob2 = new NCBlob(3, 2, palette);
      expect(blob2.speed).toBe(blob1.speed * 2);
    });

    it('starts at the origin (size derives from canvas later in initialize)', () => {
      const blob = new NCBlob(1, 1, palette);
      expect(blob.positionX).toBe(0);
      expect(blob.positionY).toBe(0);
      expect(blob.size).toBe(0);
      expect(blob.hasEntered).toBe(false);
    });

    it('derives velocity from speed and angle', () => {
      const blob = new NCBlob(1, 1, palette);
      expect(typeof blob.velocityX).toBe('number');
      expect(typeof blob.velocityY).toBe('number');
      // sqrt(vx^2 + vy^2) === speed for any angle.
      const magnitude = Math.hypot(blob.velocityX, blob.velocityY);
      expect(magnitude).toBeCloseTo(blob.speed);
    });

    it('picks a gradient from the palette', () => {
      const blob = new NCBlob(1, 1, palette);
      expect(blob.gradient).toEqual(palette[0]);
    });
  });

  describe('updatePosition', () => {
    it('advances position by velocity * dt', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 50;
      blob.velocityX = 10;
      blob.velocityY = 5;
      blob.positionX = 100;
      blob.positionY = 100;

      blob.updatePosition(1000);
      blob.updatePosition(2000);

      expect(blob.positionX).toBeGreaterThan(100);
      expect(blob.positionY).toBeGreaterThan(100);
    });

    it('clamps a huge frame gap so a backgrounded tab does not teleport the blob off-screen', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 100;
      blob.velocityX = 45;
      blob.velocityY = 45;
      blob.positionX = 500;
      blob.positionY = 400;

      blob.updatePosition(1000); // establish lastUpdate at t=1s
      // 10 minutes later: rAF was suspended while the tab was backgrounded, so
      // this is the first resumed frame. Unclamped, positionX would advance by
      // 45 * 600 = 27000px and wrap to an off-screen edge (-size); clamped, a
      // single frame moves at most 45 * (1/30) = 1.5px and the blob stays put.
      blob.updatePosition(1000 + 600_000);

      expect(blob.positionX).toBeGreaterThanOrEqual(500);
      expect(blob.positionX).toBeLessThan(510);
      expect(blob.positionY).toBeGreaterThanOrEqual(400);
      expect(blob.positionY).toBeLessThan(410);
    });

    it('seeds lastUpdate on first call', () => {
      const blob = new NCBlob(1, 1, palette);
      expect(blob.lastUpdate).toBeNull();
      blob.updatePosition(1000);
      expect(blob.lastUpdate).toBe(1);
    });

    it('does not advance on a zero time delta (same timestamp twice)', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 50;
      blob.velocityX = 50;
      blob.velocityY = 50;
      blob.positionX = 100;
      blob.positionY = 100;

      blob.updatePosition(1000); // seeds lastUpdate; first frame delta is 0
      blob.updatePosition(1000); // same timestamp → 0 delta → no movement

      expect(blob.positionX).toBe(100);
      expect(blob.positionY).toBe(100);
    });

    it('wraps past right edge to left', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.size = 100;
      blob.positionX = 1001;
      blob.velocityX = 0;
      blob.velocityY = 0;
      blob.hasEntered = true;
      blob.updatePosition(1000);
      expect(blob.positionX).toBe(-50);
    });

    it('wraps past left edge to right', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.size = 100;
      blob.positionX = -101;
      blob.velocityX = 0;
      blob.velocityY = 0;
      blob.hasEntered = true;
      blob.updatePosition(1000);
      expect(blob.positionX).toBe(950);
    });

    it('wraps past bottom edge to top', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasHeight = 800;
      blob.size = 100;
      blob.positionY = 801;
      blob.velocityX = 0;
      blob.velocityY = 0;
      blob.hasEntered = true;
      blob.updatePosition(1000);
      expect(blob.positionY).toBe(-50);
    });

    it('wraps past top edge to bottom', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasHeight = 800;
      blob.size = 100;
      blob.positionY = -101;
      blob.velocityX = 0;
      blob.velocityY = 0;
      blob.hasEntered = true;
      blob.updatePosition(1000);
      expect(blob.positionY).toBe(750);
    });

    it('lets an initially offscreen blob enter before wrapping normally', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 100;
      blob.positionX = -105;
      blob.positionY = 100;
      blob.velocityX = 300;
      blob.velocityY = 0;
      blob.hasEntered = false;

      blob.updatePosition(0);
      blob.updatePosition(1000);

      expect(blob.positionX).toBeGreaterThanOrEqual(-100);
      expect(blob.hasEntered).toBe(true);
    });
  });

  describe('placeInitialPosition', () => {
    it('can place a blob immediately inside the viewport density band', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 200;
      blob.velocityX = 10;
      blob.velocityY = 0;
      mockRandomSequence([0.75, 0.4, 0.5]);

      blob.placeInitialPosition();

      expect(blob.positionX).toBe(300);
      expect(blob.positionY).toBe(300);
      expect(blob.hasEntered).toBe(true);
    });

    it('places a left-side offscreen blob on a path that enters the canvas', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 700;
      blob.size = 200;
      blob.velocityX = 10;
      blob.velocityY = 5;
      mockRandomSequence([0.25, 0, 0.25, 4 / 9]);

      blob.placeInitialPosition();

      expect(blob.positionX).toBe(-230);
      expect(blob.positionY).toBe(185);
      expect(blob.hasEntered).toBe(false);

      const secondsUntilVisible =
        (-blob.size - blob.positionX) / blob.velocityX;
      blob.positionX += blob.velocityX * secondsUntilVisible;
      blob.positionY += blob.velocityY * secondsUntilVisible;

      expect(secondsUntilVisible).toBe(3);
      expect(blob.isWithinWrapBounds()).toBe(true);
    });

    it('places a bottom-side offscreen blob on a path that enters the canvas', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 700;
      blob.size = 200;
      blob.velocityX = 0;
      blob.velocityY = -20;
      mockRandomSequence([0.25, 0, 1 / 6, 5 / 12]);

      blob.placeInitialPosition();

      expect(blob.positionX).toBe(300);
      expect(blob.positionY).toBe(740);
      expect(blob.hasEntered).toBe(false);

      const secondsUntilVisible =
        (blob.positionY - blob.canvasHeight) / Math.abs(blob.velocityY);
      blob.positionX += blob.velocityX * secondsUntilVisible;
      blob.positionY += blob.velocityY * secondsUntilVisible;

      expect(secondsUntilVisible).toBe(2);
      expect(blob.isWithinWrapBounds()).toBe(true);
    });

    it('caps the offscreen distance by the maximum initial lead time', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 700;
      blob.size = 200;
      blob.velocityX = 10;
      blob.velocityY = 0;
      mockRandomSequence([0.25, 0, 1, 0.5]);

      blob.placeInitialPosition();

      const secondsUntilVisible =
        (-blob.size - blob.positionX) / blob.velocityX;

      expect(secondsUntilVisible).toBe(MAX_INITIAL_OFFSCREEN_LEAD_SECONDS);
    });

    it('falls back to visible placement when velocity cannot carry an offscreen blob in', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 200;
      blob.velocityX = 0;
      blob.velocityY = 0;
      mockRandomSequence([0.4, 0.5]);

      blob.placeInitialPosition();

      expect(blob.positionX).toBe(300);
      expect(blob.positionY).toBe(300);
      expect(blob.hasEntered).toBe(true);
    });
  });

  describe('makeBlobOptions', () => {
    it('returns options carrying the blob size and a [6,8] point range', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.size = 250;
      const opts = blob.makeBlobOptions();
      expect(opts.size).toBe(250);
      expect(opts.extraPoints).toBeGreaterThanOrEqual(6);
      expect(opts.extraPoints).toBeLessThanOrEqual(8);
      expect(opts.randomness).toBeGreaterThanOrEqual(6);
      expect(opts.randomness).toBeLessThanOrEqual(8);
    });
  });

  describe('scheduleNextMorph', () => {
    it('does nothing before the animation is initialised', () => {
      const blob = new NCBlob(1, 1, palette);
      expect(blob.animation).toBeNull();
      // Should not throw despite no animation.
      expect(() => blob.scheduleNextMorph()).not.toThrow();
    });

    it('hands a fresh keyframe to the animation when present', () => {
      const blob = new NCBlob(1, 1, palette);
      const transition = vi.fn();
      blob.animation = {
        transition,
        renderFrame: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        playPause: vi.fn(),
      };
      blob.size = 300;
      blob.scheduleNextMorph();
      expect(transition).toHaveBeenCalledTimes(1);
      const keyframe = transition.mock.calls[0]?.[0];
      expect(keyframe.duration).toBe(20000 * blob.speed);
      expect(keyframe.timingFunction).toBe('ease');
      expect(keyframe.blobOptions.size).toBe(300);
      expect(typeof keyframe.callback).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('does not move when velocity is zero', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 50;
      blob.velocityX = 0;
      blob.velocityY = 0;
      blob.positionX = 100;
      blob.positionY = 100;
      blob.updatePosition(1000);
      blob.updatePosition(2000);
      expect(blob.positionX).toBe(100);
      expect(blob.positionY).toBe(100);
    });

    it('moves backwards when velocity is negative', () => {
      const blob = new NCBlob(1, 1, palette);
      blob.canvasWidth = 1000;
      blob.canvasHeight = 800;
      blob.size = 50;
      blob.velocityX = -50;
      blob.velocityY = -50;
      blob.positionX = 500;
      blob.positionY = 500;
      blob.updatePosition(0);
      blob.updatePosition(1000);
      expect(blob.positionX).toBeLessThan(500);
      expect(blob.positionY).toBeLessThan(500);
    });
  });
});
