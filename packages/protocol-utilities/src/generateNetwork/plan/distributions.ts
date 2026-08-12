import { syntheticCountCeiling } from '@codaco/protocol-validation';
import type { SyntheticCount } from '@codaco/protocol-validation';

import type { RandomStream } from './random';

/**
 * Distribution samplers for planning. Each sampler draws from the caller's
 * own semantic substream, so rejection loops and per-family draw counts can
 * never perturb another consumer's sequence.
 *
 * Declared parameters are statistical targets: truncation clamps a drawn
 * value into the effective window rather than re-rolling, which keeps the
 * draw count fixed and is exactly the "targets, not guarantees" contract the
 * metadata documents.
 */

/**
 * A continuous value descriptor in resolved form. Structurally compatible
 * with the schema's number/scalar descriptor branches and with resolved
 * defaults; `beta` is only ever produced for the 0–1 scalar domain.
 */
export type ContinuousDescriptor =
  | { distribution: 'constant'; value: number }
  | { distribution: 'uniform'; min?: number; max?: number }
  | {
      distribution: 'normal';
      mean: number;
      sd: number;
      min?: number;
      max?: number;
    }
  | {
      distribution: 'lognormal';
      mean: number;
      sd: number;
      min?: number;
      max?: number;
    }
  | { distribution: 'beta'; mean: number; sd: number };

/** A hard value window the drawn value must land inside. */
export type ValueBounds = { min?: number; max?: number };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function samplePoisson(mean: number, stream: RandomStream): number {
  if (mean <= 0) return 0;
  // Knuth's product method is exact but costs O(mean) draws; past a modest
  // mean the normal approximation is statistically indistinguishable for
  // planning purposes and costs two draws.
  if (mean > 30) {
    return Math.max(0, Math.round(stream.normal(mean, Math.sqrt(mean))));
  }
  const limit = Math.exp(-mean);
  let count = 0;
  let product = stream.next();
  while (product > limit) {
    count += 1;
    product *= stream.next();
  }
  return count;
}

// Marsaglia–Tsang, with the standard boost for shape < 1. The rejection loop
// draws only from this consumer's stream.
function sampleGamma(shape: number, stream: RandomStream): number {
  if (shape < 1) {
    const boost = Math.pow(1 - stream.next(), 1 / shape);
    return sampleGamma(shape + 1, stream) * boost;
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = stream.normal(0, 1);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = 1 - stream.next();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(mean: number, sd: number, stream: RandomStream): number {
  if (sd === 0) return mean;
  // Method-of-moments: nu = mean(1-mean)/sd^2 - 1; schema validation
  // guarantees sd^2 < mean(1-mean), so nu > 0 and both shapes are positive.
  const nu = (mean * (1 - mean)) / (sd * sd) - 1;
  const alpha = mean * nu;
  const beta = (1 - mean) * nu;
  // The opposite limit to the one handled below, and it needs the opposite
  // answer. A tiny deviation — `sd: 1e-200` is schema-valid — underflows
  // `sd * sd` to zero, so `nu` and both shapes become Infinity. The gamma
  // draws then overflow and the endpoint fallback would return 0 or 1: the
  // extremes, for a descriptor asking for a distribution pinned AT its mean.
  // As the shapes diverge a Beta concentrates on the mean, so that is what a
  // near-degenerate one draws.
  if (!Number.isFinite(alpha) || !Number.isFinite(beta)) return mean;
  const x = sampleGamma(alpha, stream);
  const y = sampleGamma(beta, stream);
  const total = x + y;
  // At the variance limit the shapes approach zero and both gamma draws
  // underflow to zero, leaving this ratio as 0/0. The limit is not undefined
  // though: as the shapes vanish a Beta puts all its mass on the endpoints,
  // with P(1) = alpha/(alpha+beta) = mean. Drawing that Bernoulli is the
  // distribution the descriptor asks for rather than a repair of it, and it
  // keeps a NaN — which survives every later clamp — out of the network.
  if (!Number.isFinite(total) || total === 0) {
    return stream.next() < mean ? 1 : 0;
  }
  return x / total;
}

/**
 * A ceiling no draw from the descriptor can exceed, for seed-independent
 * worst-case feasibility counting.
 *
 * The open families have no natural maximum, so an undeclared one is pinned
 * at six sigma. That bound is only sound because {@link sampleCount} clamps to
 * this very function: an unclamped tail would let a seed create more entities
 * than preflight counted, so a protocol whose value space feasibility had
 * approved could still exhaust it mid-plan.
 *
 * A declared minimum raises the implicit ceiling to meet it. Six sigma around a
 * small mean can land below a minimum the author declared separately — a
 * Poisson of mean 0 with a floor of 5 is schema-valid, since the bounds check
 * only orders a minimum against a maximum that is present — and the clamp would
 * then read `[5, 1]` and settle on 1, breaking the floor rather than holding it.
 */
export function countCeiling(count: SyntheticCount): number {
  // Delegated to the schema's own derivation, which is what the population cap
  // is enforced against. Two copies of this arithmetic would let a count the
  // schema accepts plan more entities than the cap allowed.
  return syntheticCountCeiling(count);
}

/**
 * Draws a non-negative integer entity count. Truncation bounds apply after
 * rounding, per the metadata contract.
 */
export function sampleCount(
  descriptor: SyntheticCount,
  stream: RandomStream,
): number {
  switch (descriptor.distribution) {
    case 'constant':
      return descriptor.value;
    case 'uniform':
      return stream.int(descriptor.min, descriptor.max);
    case 'poisson': {
      const raw = samplePoisson(descriptor.mean, stream);
      return clamp(raw, descriptor.min ?? 0, countCeiling(descriptor));
    }
    case 'normal': {
      const raw = Math.round(stream.normal(descriptor.mean, descriptor.sd));
      return clamp(raw, descriptor.min ?? 0, countCeiling(descriptor));
    }
  }
}

/**
 * Draws a continuous value inside the intersection of the descriptor's own
 * window and the hard bounds (typically validation bounds, or the 0–1 scalar
 * domain). Schema validation has already rejected empty intersections where
 * it could see both sides.
 */
export function sampleContinuous(
  descriptor: ContinuousDescriptor,
  bounds: ValueBounds,
  stream: RandomStream,
): number {
  const lower = Math.max(
    'min' in descriptor
      ? (descriptor.min ?? Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY,
    bounds.min ?? Number.NEGATIVE_INFINITY,
  );
  const upper = Math.min(
    'max' in descriptor
      ? (descriptor.max ?? Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY,
    bounds.max ?? Number.POSITIVE_INFINITY,
  );

  switch (descriptor.distribution) {
    case 'constant':
      return clamp(descriptor.value, lower, upper);
    case 'uniform': {
      // A uniform without its own bounds draws over the hard window; the
      // schema only permits omitting them where such a window exists.
      if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
        throw new Error(
          'A uniform synthetic descriptor needs a finite window to draw from.',
        );
      }
      return stream.float(lower, upper);
    }
    case 'normal':
      return clamp(stream.normal(descriptor.mean, descriptor.sd), lower, upper);
    case 'lognormal': {
      if (descriptor.sd === 0) {
        return clamp(descriptor.mean, lower, upper);
      }
      // Natural-units mean/sd to log-space parameters.
      const ratio = descriptor.sd / descriptor.mean;
      const sigmaSquared = Math.log(1 + ratio * ratio);
      const mu = Math.log(descriptor.mean) - sigmaSquared / 2;
      const value = Math.exp(stream.normal(mu, Math.sqrt(sigmaSquared)));
      return clamp(value, lower, upper);
    }
    case 'beta':
      return clamp(
        sampleBeta(descriptor.mean, descriptor.sd, stream),
        lower,
        upper,
      );
  }
}

/**
 * Index draw proportional to non-negative weights. The caller guarantees at
 * least one positive weight (schema validation enforces it for authored
 * tables; defaults are all-equal).
 */
export function sampleWeightedIndex(
  weights: readonly number[],
  stream: RandomStream,
): number {
  // Scaled by the largest weight before summing. Weights are only ever
  // compared with one another, so scaling changes nothing about the
  // distribution — but two schema-valid weights of 1e308 sum to Infinity, and
  // `remaining` then never falls below zero (or is NaN when the draw is
  // exactly zero), so no iteration can select and every draw returns the last
  // option. Equal weights would produce a deterministic value.
  const largest = weights.reduce(
    (most, weight) => (weight > most ? weight : most),
    0,
  );
  if (!(largest > 0)) return 0;
  const scaled = weights.map((weight) => weight / largest);
  const total = scaled.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return 0;
  let remaining = stream.next() * total;
  for (let index = 0; index < weights.length; index++) {
    remaining -= scaled[index]!;
    if (remaining < 0) return index;
  }
  return weights.length - 1;
}

/**
 * Draws `count` distinct values without replacement, proportionally to their
 * weights. Zero-weight values are never selected; the caller keeps `count`
 * within the number of positively-weighted values.
 */
export function sampleWithoutReplacement<T>(
  values: readonly T[],
  weights: readonly number[],
  count: number,
  stream: RandomStream,
): T[] {
  const pool = values.map((value, index) => ({
    value,
    weight: weights[index] ?? 0,
  }));
  const selected: T[] = [];
  while (selected.length < count) {
    const selectable = pool.filter((entry) => entry.weight > 0);
    if (selectable.length === 0) break;
    const index = sampleWeightedIndex(
      selectable.map((entry) => entry.weight),
      stream,
    );
    const picked = selectable[index]!;
    selected.push(picked.value);
    picked.weight = 0;
  }
  return selected;
}
