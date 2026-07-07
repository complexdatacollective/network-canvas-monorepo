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

    // Wrap around screen boundaries, taking into account shape size.
    // Branches must be mutually exclusive: a left-exit reset to
    // (canvasWidth + size) would otherwise re-trigger the right-exit branch.
    if (this.positionX < 0 - this.size) {
      this.positionX = this.canvasWidth + this.size;
    } else if (this.positionX > this.canvasWidth) {
      this.positionX = -this.size;
    }

    if (this.positionY < 0 - this.size) {
      this.positionY = this.canvasHeight + this.size;
    } else if (this.positionY > this.canvasHeight) {
      this.positionY = -this.size;
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

    this.positionX = randomInt(
      0 - this.size / 2,
      this.canvasWidth - this.size / 2,
    );
    this.positionY = randomInt(
      0 - this.size / 2,
      this.canvasHeight - this.size / 2,
    );

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
