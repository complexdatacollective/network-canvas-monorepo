export const MAX_ELAPSED_MS = 366 * 24 * 60 * 60 * 1000;

export const elapsedMs = (from: number, to: number = Date.now()): number =>
  Math.min(Math.max(0, Math.round(to - from)), MAX_ELAPSED_MS);
