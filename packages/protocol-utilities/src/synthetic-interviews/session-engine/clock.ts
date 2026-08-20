import {
  SYNTHETIC_CLOCK_JITTER_SIGMA,
  SYNTHETIC_FINISH_BEAT_SECONDS,
  SYNTHETIC_SECONDS_PER_BURDEN,
  SYNTHETIC_START_WINDOW_DAYS,
} from '@codaco/protocol-validation';

import type { SessionStreams } from './streams';

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * MS_PER_SECOND;

/**
 * The simulated wall clock one session lives on. Every number it multiplies
 * by is schema-owned (spec rule 2): the seconds-per-burden rate, the lognormal
 * jitter sigma, the start-window span, and the finish beat all come from
 * `@codaco/protocol-validation`'s clock module — this class only does the
 * arithmetic.
 *
 * The model, deliberately coarse (the spec calls timestamps plausibility, not
 * analysis targets): the session starts at a seeded instant inside the batch's
 * start window; each visited stage advances the clock by
 * `burden × rate × jitter` BEFORE its simulator runs, so every write a stage
 * makes is stamped with the moment the participant finished working on it;
 * finishing adds one jittered beat after the last answer.
 */
export type SessionClock = {
  /** ISO instant the session began. */
  readonly startTime: string;
  /** The current simulated instant, as an ISO string. */
  now: () => string;
  /** Advance through a stage the participant spent `burden` on. */
  advanceThroughStage: (responseBurden: number) => void;
  /** The instant a completed session's finish confirmation lands. */
  finishInstant: () => string;
};

/**
 * `anchor` is the ISO instant the window ends at (the engine resolves the
 * option's default — one clock read per batch — before any session starts, so
 * a batch is internally consistent and a pinned `startWindow` is fully
 * deterministic).
 */
export const createSessionClock = (
  anchor: string,
  streams: SessionStreams,
): SessionClock => {
  const anchorMs = Date.parse(anchor);
  if (Number.isNaN(anchorMs)) {
    throw new Error(
      `Cannot generate a synthetic interview: startWindow "${anchor}" is not a parseable instant`,
    );
  }

  const startMs =
    anchorMs -
    Math.floor(streams.draw('clock') * SYNTHETIC_START_WINDOW_DAYS * MS_PER_DAY);
  let nowMs = startMs;

  // Median multiplier 1 (mu = 0); sigma is the schema's calibration.
  const jitter = () =>
    Math.exp(SYNTHETIC_CLOCK_JITTER_SIGMA * streams.normal('clock'));

  return {
    startTime: new Date(startMs).toISOString(),
    now: () => new Date(nowMs).toISOString(),
    advanceThroughStage: (responseBurden) => {
      nowMs += Math.round(
        responseBurden * SYNTHETIC_SECONDS_PER_BURDEN * MS_PER_SECOND * jitter(),
      );
    },
    finishInstant: () =>
      new Date(
        nowMs + Math.round(SYNTHETIC_FINISH_BEAT_SECONDS * MS_PER_SECOND * jitter()),
      ).toISOString(),
  };
};
