import * as blobs2 from 'blobs/v2';
import * as blobs2Animate from 'blobs/v2/animate';
import { interpolatePath } from 'd3-interpolate-path';

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

const defaultGradients: ReadonlyArray<readonly [string, string]> = [
  ['rgb(237,0,140)', 'rgb(226,33,91)'],
  ['#00c9ff', '#92fe9d'],
  ['#fc466b', '#3f5efb'],
  ['#d53369', '#daae51'],
  ['#3f2b96', '#a8c0ff'],
];

type BlobAdapter = {
  render(ctx: CanvasRenderingContext2D, time: number): void;
};

// =========================================================
// OLD: snapshot of NCBlob after the two fixes are applied
// (cached gradient, but still uses blobs/v2.svgPath + d3-interpolate-path)
// =========================================================
class BlobOld implements BlobAdapter {
  layer: 1 | 2 | 3;
  speed: number;
  angle: number;
  size: number;
  velocityX: number;
  velocityY: number;
  gradient: readonly [string, string] | undefined;
  firstRender: boolean;
  animateForward: boolean;
  lastUpdate: number | null;
  positionX: number;
  positionY: number;
  canvasWidth: number;
  canvasHeight: number;
  startFrameTime: number | undefined;
  endFrameTime: number | undefined;
  shape: string | null;
  shape2: string | null;
  interpolator: ((t: number) => string) | null;
  cachedGradient: CanvasGradient | null;

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
    this.animateForward = true;
    this.lastUpdate = null;
    this.positionX = 0;
    this.positionY = 0;
    this.size = 0;
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    this.shape = null;
    this.shape2 = null;
    this.interpolator = null;
    this.cachedGradient = null;
  }

  updatePosition(time: number) {
    const timeInSeconds = time / 1000;
    if (!this.lastUpdate) this.lastUpdate = timeInSeconds;
    const timeDelta = timeInSeconds - this.lastUpdate || 1;
    this.lastUpdate = timeInSeconds;
    this.positionX += this.velocityX * timeDelta;
    this.positionY += this.velocityY * timeDelta;
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

  invert(n: number) {
    return this.animateForward ? n : n * -1 + 1;
  }

  animationPosition(time: number) {
    const duration = 20000 * this.speed;
    if (!this.startFrameTime) {
      this.startFrameTime = time;
      this.endFrameTime = time + duration;
      return this.invert(0);
    }
    if (!this.endFrameTime || time > this.endFrameTime) {
      this.startFrameTime = time;
      this.endFrameTime = time + duration;
      this.animateForward = !this.animateForward;
    }
    return this.invert(
      (time - this.startFrameTime) / (this.endFrameTime - this.startFrameTime),
    );
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
    this.shape = blobs2.svgPath({
      seed: Math.random(),
      extraPoints: 6,
      randomness: 6,
      size: this.size,
    });
    this.shape2 = blobs2.svgPath({
      seed: Math.random(),
      extraPoints: 8,
      randomness: 8,
      size: this.size,
    });
    this.interpolator = interpolatePath(this.shape, this.shape2);
    if (this.gradient) {
      const grd = ctx.createLinearGradient(0, 0, this.size, 0);
      grd.addColorStop(0, this.gradient[0]);
      grd.addColorStop(1, this.gradient[1]);
      this.cachedGradient = grd;
    }
    this.firstRender = false;
  }

  render(ctx: CanvasRenderingContext2D, time: number) {
    if (this.firstRender) this.initialize(ctx);
    if (!this.interpolator || !this.cachedGradient) return;
    this.updatePosition(time);
    ctx.fillStyle = this.cachedGradient;
    const t = this.animationPosition(time);
    const p = new Path2D(this.interpolator(t));
    ctx.save();
    ctx.translate(this.positionX, this.positionY);
    ctx.fill(p);
    ctx.restore();
  }
}

// =========================================================
// NEW: built on blobs/v2/animate.canvasPath()
// No SVG string interpolation, no per-frame Path2D parsing.
// =========================================================
class BlobNew implements BlobAdapter {
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
    if (!this.lastUpdate) this.lastUpdate = timeInSeconds;
    const timeDelta = timeInSeconds - this.lastUpdate || 1;
    this.lastUpdate = timeInSeconds;
    this.positionX += this.velocityX * timeDelta;
    this.positionY += this.velocityY * timeDelta;
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
    if (this.firstRender) this.initialize(ctx);
    if (!this.animation || !this.cachedGradient) return;
    this.updatePosition(time);
    ctx.fillStyle = this.cachedGradient;
    const p = this.animation.renderFrame();
    ctx.save();
    ctx.translate(this.positionX, this.positionY);
    ctx.fill(p);
    ctx.restore();
  }
}

// =========================================================
// Harness
// =========================================================
type Trial = {
  mean: number;
  median: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
};

const stats = (samples: Float64Array): Trial => {
  const sorted = Array.from(samples).toSorted((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / sorted.length;
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    mean,
    median: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
};

const runTrial = (
  blobs: BlobAdapter[],
  ctx: CanvasRenderingContext2D,
  frames: number,
  warmup: number,
): Trial => {
  for (let i = 0; i < warmup; i++) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const b of blobs) b.render(ctx, i * 16.6667);
  }

  const samples = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const b of blobs) b.render(ctx, (warmup + i) * 16.6667);
    samples[i] = performance.now() - t0;
  }
  return stats(samples);
};

export const runBench = () => {
  const TRIALS = 5;
  const FRAMES = 600;
  const WARMUP = 60;
  const WIDTH = 1920;
  const HEIGHT = 1080;
  const BLOB_COUNTS: Array<[1 | 2 | 3, number]> = [
    [3, 2],
    [2, 4],
    [1, 4],
  ];

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${WIDTH / 2}px`;
  canvas.style.height = `${HEIGHT / 2}px`;
  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(HEIGHT * dpr);
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.scale(dpr, dpr);

  const trials: Record<'old' | 'new', Trial[]> = { old: [], new: [] };

  for (let trial = 0; trial < TRIALS; trial++) {
    const oldBlobs: BlobAdapter[] = [];
    const newBlobs: BlobAdapter[] = [];
    for (const [layer, count] of BLOB_COUNTS) {
      for (let i = 0; i < count; i++) {
        oldBlobs.push(new BlobOld(layer, 1, defaultGradients));
        newBlobs.push(new BlobNew(layer, 1, defaultGradients));
      }
    }
    // Alternate ordering between trials to absorb cold-cache bias.
    if (trial % 2 === 0) {
      trials.old.push(runTrial(oldBlobs, ctx, FRAMES, WARMUP));
      trials.new.push(runTrial(newBlobs, ctx, FRAMES, WARMUP));
    } else {
      trials.new.push(runTrial(newBlobs, ctx, FRAMES, WARMUP));
      trials.old.push(runTrial(oldBlobs, ctx, FRAMES, WARMUP));
    }
  }

  return {
    config: {
      trials: TRIALS,
      frames: FRAMES,
      warmup: WARMUP,
      width: WIDTH,
      height: HEIGHT,
      dpr,
      blobCount: BLOB_COUNTS.reduce((s, [, c]) => s + c, 0),
    },
    trials,
  };
};
