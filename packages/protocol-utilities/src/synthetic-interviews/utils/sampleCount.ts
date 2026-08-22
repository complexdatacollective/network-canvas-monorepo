import type { SyntheticCount } from '@codaco/protocol-validation';

import type { SessionStreams } from '../session-engine/streams';
import {
  sampleNormal,
  samplePoisson,
  sampleTruncated,
  type UniformSource,
} from '../value-generators/distributions';

/**
 * How many entities one stage elicits, drawn from the session's `counts`
 * substream.
 *
 * The stream is passed in rather than read from a module-level generator, so
 * adding a draw anywhere else in the walk — a panel coin, a dropout die, an
 * extra entity id — cannot move how many people a stage elicits (spec's
 * Determinism section).
 */
export const countUniform =
  (streams: SessionStreams): UniformSource =>
  (min, max) =>
    min + streams.draw('counts') * (max - min);

/**
 * The number of entities one stage creates, drawn from its declared count.
 *
 * Open-tailed families are drawn as TRUNCATED distributions over their own
 * `min`/`max`, which the schema fills in from the stage's behaviours window
 * where an author left them open. `constant` and `uniform` need no truncation:
 * their support already is their bounds.
 *
 * The `count.min ?? 0` / `count.max ?? Infinity` reads are the open tail's own
 * absence standing for the unbounded side — an intersection, not a default
 * (the C6 guard keys its fallback patterns on `synthetic`/`descriptor`
 * receivers for exactly this reason).
 *
 * Returns a whole number of people.
 */
export const sampleCount = (
  count: SyntheticCount,
  uniform: UniformSource,
): number => {
  switch (count.distribution) {
    case 'constant':
      return count.value;
    case 'uniform':
      // [min, max] inclusive: the source is half-open on max, so the window is
      // widened by one and floored back.
      return Math.floor(uniform(count.min, count.max + 1));
    case 'poisson':
      return sampleTruncated(
        () => Math.round(samplePoisson(uniform, count.mean)),
        count.min ?? 0,
        count.max ?? Number.POSITIVE_INFINITY,
      );
    case 'normal':
      return sampleTruncated(
        () => Math.round(sampleNormal(uniform, count.mean, count.sd)),
        count.min ?? 0,
        count.max ?? Number.POSITIVE_INFINITY,
      );
  }
};
