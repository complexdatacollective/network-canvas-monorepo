/**
 * The distributions a protocol's `synthetic` metadata may declare, sampled
 * from a caller-supplied uniform source.
 *
 * Parameterised by that source rather than reaching for a generator of their
 * own: a synthetic interview draws everything from one seeded stream, so a
 * sampler holding its own would be one a seed does not fix. Stage counts pass
 * the session's faker; variable values pass the `ValueGenerator`'s.
 */
export type UniformSource = (min: number, max: number) => number;

/**
 * How many redraws a truncated or rejection-sampled family gets before falling
 * back to a value inside its window.
 *
 * The schema holds a declared distribution's centre inside its own bounds, so
 * acceptance is high and exhausting this is vanishingly unlikely. The bound is
 * what keeps a protocol that reached generation without being parsed from
 * spinning rather than returning.
 */
const MAX_SAMPLING_ATTEMPTS = 100;

/**
 * Draw from a normal distribution using the Box-Muller transform.
 *
 * The uniform is drawn on (0, 1]: `Math.log(0)` is -Infinity, and the sources
 * this is handed are inclusive of their minimum.
 */
export const sampleNormal = (
  random: UniformSource,
  mean: number,
  sd: number,
): number => {
  if (sd === 0) return mean;
  const uniform = 1 - random(0, 1);
  const angle = 2 * Math.PI * random(0, 1);
  return mean + sd * Math.sqrt(-2 * Math.log(uniform)) * Math.cos(angle);
};

/**
 * Draw from a Poisson distribution by Knuth's method: multiply uniforms until
 * the product falls below e^-mean, and count how many it took.
 *
 * Exact for the means a protocol may declare — `populationInt` caps a count at
 * a few hundred, where e^-mean is still a normal double — so the numerically
 * stable but approximate alternatives are not needed here.
 */
export const samplePoisson = (random: UniformSource, mean: number): number => {
  if (mean <= 0) return 0;
  const threshold = Math.exp(-mean);
  let product = 1;
  let draws = 0;
  do {
    product *= random(0, 1);
    draws += 1;
  } while (product > threshold);
  return draws - 1;
};

/**
 * Draw from a lognormal distribution whose OWN mean and standard deviation are
 * `mean` and `sd`.
 *
 * The schema names these fields exactly as it names a normal's, so they are
 * read to mean the same thing: a centre and a spread in the units the variable
 * is recorded in, not the log-space parameters an author would have to derive.
 * Solving for those is the method of moments — `sigma² = ln(1 + sd²/mean²)`,
 * `mu = ln(mean) - sigma²/2` — which also collapses `sd: 0` to exactly `mean`,
 * the reading every zero-deviation rule in the schema already takes.
 */
export const sampleLognormal = (
  random: UniformSource,
  mean: number,
  sd: number,
): number => {
  if (sd === 0) return mean;
  const variance = Math.log(1 + (sd * sd) / (mean * mean));
  return Math.exp(
    sampleNormal(random, Math.log(mean) - variance / 2, Math.sqrt(variance)),
  );
};

/**
 * Draw from a gamma distribution of unit scale by Marsaglia and Tsang's
 * method, which the beta below is built from.
 *
 * A shape below 1 is drawn from `shape + 1` and scaled down, which is the
 * boost their method prescribes rather than a fudge.
 */
const sampleGamma = (random: UniformSource, shape: number): number => {
  if (shape < 1) {
    return sampleGamma(random, shape + 1) * Math.pow(random(0, 1), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (let attempt = 0; attempt < MAX_SAMPLING_ATTEMPTS; attempt += 1) {
    const z = sampleNormal(random, 0, 1);
    const v = (1 + c * z) ** 3;
    if (v <= 0) continue;
    if (Math.log(random(0, 1)) < 0.5 * z * z + d - d * v + d * Math.log(v)) {
      return d * v;
    }
  }

  // Unreachable in practice: the method accepts better than nine draws in ten
  // for every shape. Returning the distribution's own mean keeps generation
  // deterministic rather than throwing on a run of unlucky draws.
  return shape;
};

/**
 * Draw from a beta distribution with the given mean and standard deviation.
 *
 * Parameterised by moments because that is what the schema declares, and
 * because the spread of a proportion is the thing an author can reason about.
 * The shape parameters follow from them, and the schema's own
 * `sd² < mean × (1 − mean)` refinement is exactly the condition that keeps
 * both positive.
 */
export const sampleBeta = (
  random: UniformSource,
  mean: number,
  sd: number,
): number => {
  if (sd === 0) return mean;

  const common = (mean * (1 - mean)) / (sd * sd) - 1;
  // Guaranteed positive by the schema's refinement; a protocol that reached
  // generation unparsed gets its declared centre rather than a NaN.
  if (common <= 0) return mean;

  const x = sampleGamma(random, mean * common);
  const y = sampleGamma(random, (1 - mean) * common);
  const total = x + y;
  return total === 0 ? mean : x / total;
};

/**
 * Draw from `sample` until the result lands inside `[min, max]`.
 *
 * TRUNCATION, not clamping: an out-of-bounds draw is discarded and redrawn, so
 * the result is the distribution conditioned on falling in range. Clamping
 * instead would move every rejected draw onto the nearest bound, turning the
 * tails into spikes — a `normal mean 8, sd 3` capped at 5 would return exactly
 * 5 in five draws out of six, reported as a distribution rather than the
 * constant it had become.
 *
 * `sample` returns the value in its final form, so a caller that wants whole
 * numbers rounds inside it and the accepted values are exactly the whole
 * numbers in range rather than the rounding of an in-range real.
 */
export const sampleTruncated = (
  sample: () => number,
  min: number,
  max: number,
): number => {
  if (min >= max) return min;

  for (let attempt = 0; attempt < MAX_SAMPLING_ATTEMPTS; attempt += 1) {
    const draw = sample();
    if (draw >= min && draw <= max) return draw;
  }

  // Unreachable for a parsed protocol (see MAX_SAMPLING_ATTEMPTS). Returning
  // the nearer bound keeps generation deterministic rather than throwing on a
  // draw that is merely unlucky.
  return Math.min(Math.max(sample(), min), max);
};
