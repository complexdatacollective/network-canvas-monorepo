'use client';

import * as blobs2Animate from 'blobs/v2/animate';

import { clampFrameDelta } from '../frameDelta';

const random = (a = 1, b = 0) => {
  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  return lower + Math.random() * (upper - lower);
};

const randomInt = (a = 1, b = 0) => {
  const lower = Math.ceil(Math.min(a, b));
  const upper = Math.floor(Math.max(a, b));
  return Math.floor(lower + Math.random() * (upper - lower + 1));
};

const INITIAL_OFFSCREEN_PROBABILITY = 0.5;
export const MAX_INITIAL_OFFSCREEN_LEAD_SECONDS = 12;
const MINIMUM_INCOMING_VELOCITY = 0.001;

export class NCBlob {
  layer: 1 | 2 | 3;
  speed: number;
  angle: number;
  size: number;
  velocityX: number;
  velocityY: number;
  gradient: readonly [string, string] | undefined;
  firstRender: boolean;
  lastUpdate: number | null;
  positionX: number;
  positionY: number;
  canvasWidth: number;
  canvasHeight: number;
  cachedGradient: CanvasGradient | null;
  animation: ReturnType<typeof blobs2Animate.canvasPath> | null;
  currentTime: number;
  hasEntered: boolean;

  constructor(
    layer: 1 | 2 | 3,
    speedFactor: number,
    palette: ReadonlyArray<readonly [string, string]>,
  ) {
    const speeds = {
      1: speedFactor * random(3, 6),
      2: speedFactor * random(0.5, 1.5),
      3: speedFactor * 0.5,
    };

    this.layer = layer;
    this.speed = speeds[layer];
    this.angle = (randomInt(0, 360) * Math.PI) / 180;
    this.velocityX = Math.sin(this.angle) * this.speed;
    this.velocityY = Math.cos(this.angle) * this.speed;

    this.gradient = palette[randomInt(0, palette.length - 1)];

    this.firstRender = true;
    this.lastUpdate = null;
    this.positionX = 0;
    this.positionY = 0;
    this.size = 0;

    this.canvasWidth = 0;
    this.canvasHeight = 0;

    this.cachedGradient = null;
    this.animation = null;
    this.currentTime = 0;
    this.hasEntered = false;
  }

  isWithinWrapBounds() {
    return (
      this.positionX >= -this.size &&
      this.positionX <= this.canvasWidth &&
      this.positionY >= -this.size &&
      this.positionY <= this.canvasHeight
    );
  }

  wrapPosition() {
    // The blob path is generated inside a 0..size box and translated by
    // positionX/positionY. When a blob exits, place its centre on the opposite
    // canvas edge so the replacement is immediately visible instead of waiting
    // offscreen for the whole blob width to drift back in.
    if (this.positionX < -this.size) {
      this.positionX = this.canvasWidth - this.size / 2;
    } else if (this.positionX > this.canvasWidth) {
      this.positionX = -this.size / 2;
    }

    if (this.positionY < -this.size) {
      this.positionY = this.canvasHeight - this.size / 2;
    } else if (this.positionY > this.canvasHeight) {
      this.positionY = -this.size / 2;
    }
  }

  placeInitialPosition() {
    const sides: Array<'left' | 'right' | 'top' | 'bottom'> = [];

    if (this.velocityX > MINIMUM_INCOMING_VELOCITY) sides.push('left');
    else if (this.velocityX < -MINIMUM_INCOMING_VELOCITY) sides.push('right');

    if (this.velocityY > MINIMUM_INCOMING_VELOCITY) sides.push('top');
    else if (this.velocityY < -MINIMUM_INCOMING_VELOCITY) sides.push('bottom');

    const shouldSpawnOffscreen =
      sides.length > 0 && random(0, 1) < INITIAL_OFFSCREEN_PROBABILITY;

    if (!shouldSpawnOffscreen) {
      this.positionX = random(-this.size / 2, this.canvasWidth - this.size / 2);
      this.positionY = random(
        -this.size / 2,
        this.canvasHeight - this.size / 2,
      );
      this.hasEntered = true;
      return;
    }

    const side = sides[Math.floor(random(0, sides.length))] ?? sides[0];

    if (side === 'left' || side === 'right') {
      const speedTowardCanvas = Math.abs(this.velocityX);
      const distance = random(
        0,
        speedTowardCanvas * MAX_INITIAL_OFFSCREEN_LEAD_SECONDS,
      );
      const secondsUntilVisible = distance / speedTowardCanvas;
      const yWhenVisible = random(-this.size, this.canvasHeight);

      this.positionX =
        side === 'left' ? -this.size - distance : this.canvasWidth + distance;
      this.positionY = yWhenVisible - this.velocityY * secondsUntilVisible;
    } else {
      const speedTowardCanvas = Math.abs(this.velocityY);
      const distance = random(
        0,
        speedTowardCanvas * MAX_INITIAL_OFFSCREEN_LEAD_SECONDS,
      );
      const secondsUntilVisible = distance / speedTowardCanvas;
      const xWhenVisible = random(-this.size, this.canvasWidth);

      this.positionX = xWhenVisible - this.velocityX * secondsUntilVisible;
      this.positionY =
        side === 'top' ? -this.size - distance : this.canvasHeight + distance;
    }

    this.hasEntered = this.isWithinWrapBounds();
  }

  updatePosition(time: number) {
    const timeInSeconds = time / 1000;

    // Explicit null check (not `!this.lastUpdate`) so a legitimate 0 timestamp
    // isn't treated as uninitialised; a first/zero-length frame yields a 0 delta
    // and no movement, mirroring BackgroundLights' `last === null ? 0 : …`.
    if (this.lastUpdate === null) {
      this.lastUpdate = timeInSeconds;
    }
    const timeDelta = clampFrameDelta(timeInSeconds - this.lastUpdate);

    this.lastUpdate = timeInSeconds;

    this.positionX += this.velocityX * timeDelta;
    this.positionY += this.velocityY * timeDelta;

    if (this.hasEntered) {
      this.wrapPosition();
    } else if (this.isWithinWrapBounds()) {
      this.hasEntered = true;
    }
  }

  makeBlobOptions() {
    return {
      seed: Math.random(),
      extraPoints: randomInt(6, 8),
      randomness: randomInt(6, 8),
      size: this.size,
    };
  }

  // Library transitions from a centroid-collapsed synthetic frame on the
  // first call; a duration:0 keyframe snaps to the initial shape so the blob
  // appears immediately instead of fading in over the full morph duration.
  startMorphLoop() {
    if (!this.animation) return;
    this.animation.transition(
      { duration: 0, blobOptions: this.makeBlobOptions() },
      {
        duration: 20000 * this.speed,
        timingFunction: 'ease',
        blobOptions: this.makeBlobOptions(),
        callback: () => this.scheduleNextMorph(),
      },
    );
  }

  scheduleNextMorph() {
    if (!this.animation) return;
    this.animation.transition({
      duration: 20000 * this.speed,
      timingFunction: 'ease',
      blobOptions: this.makeBlobOptions(),
      callback: () => this.scheduleNextMorph(),
    });
  }

  initialize(ctx: CanvasRenderingContext2D) {
    const { devicePixelRatio } = window;

    this.canvasWidth = ctx.canvas.width / devicePixelRatio;
    this.canvasHeight = ctx.canvas.height / devicePixelRatio;

    const vmin = Math.min(this.canvasWidth, this.canvasHeight);

    const sizes = {
      1: randomInt(vmin * 0.1, vmin * 0.2),
      2: randomInt(vmin * 0.5, vmin * 0.8),
      3: randomInt(vmin, vmin * 1.2),
    };

    this.size = sizes[this.layer];

    this.placeInitialPosition();

    if (this.gradient) {
      const grd = ctx.createLinearGradient(0, 0, this.size, 0);
      grd.addColorStop(0, this.gradient[0]);
      grd.addColorStop(1, this.gradient[1]);
      this.cachedGradient = grd;
    }

    this.animation = blobs2Animate.canvasPath(() => this.currentTime);
    this.startMorphLoop();

    this.firstRender = false;
  }

  render(ctx: CanvasRenderingContext2D, time: number) {
    this.currentTime = time;

    if (this.firstRender) {
      this.initialize(ctx);
    }

    if (!this.animation || !this.cachedGradient) return;

    this.updatePosition(time);

    ctx.fillStyle = this.cachedGradient;

    const p = this.animation.renderFrame();

    // Save before translating so we can restore afterwards - important!
    ctx.save();
    ctx.translate(this.positionX, this.positionY);
    ctx.fill(p);
    ctx.restore();
  }
}
