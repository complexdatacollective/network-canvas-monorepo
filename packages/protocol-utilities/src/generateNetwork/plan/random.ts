import { en, Faker } from '@faker-js/faker';

/**
 * Semantic seeded RNG substreams.
 *
 * Every consumer draws from a stream addressed by a semantic path (e.g.
 * `['count', 'person']` or `['variable', variableId, entityIndex]`) rather
 * than from one shared sequence. Each path derives its own generator seed
 * from the root seed, so:
 *
 * - the same protocol, seed, and path always replay the same draws, and
 * - an unrelated variable, entity, or extra draw consumes numbers from its
 *   own stream only — it cannot perturb what any other path generates.
 *
 * Streams are memoised by path: asking for the same path twice continues the
 * sequence instead of replaying it. Rejection-sampling loops are therefore
 * safe — however many draws one stream burns, no other stream moves.
 */

export type RandomStream = {
  /** Uniform draw in [0, 1). */
  next(): number;
  /**
   * Uniform integer in [min, max] (inclusive). Collapses to min when
   * min > max, mirroring the engine's historical tolerance for inverted
   * ranges.
   */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** Normal draw via Box–Muller. A zero sd returns the mean. */
  normal(mean: number, sd: number): number;
  /** Bernoulli draw. */
  bool(probability: number): boolean;
  /**
   * Seeded Faker instance owned by this stream, created lazily so streams
   * that never fabricate text pay nothing. Deterministic per (seed, path).
   */
  faker(): Faker;
};

export type RandomSource = {
  /** The stream for a semantic path, created on first access and memoised. */
  stream(...path: (string | number)[]): RandomStream;
  /** The root seed the source was created with. */
  readonly seed: number;
};

// Same generator the constraint solver's deterministic shuffle uses.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over the root seed and the joined path. 32-bit integer maths only,
// so the derivation is identical on every platform.
//
// NUL separates the parts because no path segment can contain one, so no two
// distinct paths can collide on a joined key. Written as an escape rather than
// the byte itself: a literal NUL in the source makes git classify the whole
// file as binary, which costs every diff, review and line-wise merge of it.
function deriveStreamSeed(rootSeed: number, pathKey: string): number {
  let hash = 2166136261 >>> 0;
  const input = `${rootSeed}\u0000${pathKey}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function createStream(streamSeed: number): RandomStream {
  const next = mulberry32(streamSeed);
  let fakerInstance: Faker | undefined;

  return {
    next,
    int(min, max) {
      if (min > max) return min;
      return Math.floor(next() * (max - min + 1)) + min;
    },
    float(min, max) {
      if (min > max) return min;
      return min + next() * (max - min);
    },
    normal(mean, sd) {
      if (sd === 0) return mean;
      // 1 − next() keeps the log argument in (0, 1].
      const radius = Math.sqrt(-2 * Math.log(1 - next()));
      const angle = 2 * Math.PI * next();
      return mean + sd * radius * Math.cos(angle);
    },
    bool(probability) {
      return next() < probability;
    },
    faker() {
      if (!fakerInstance) {
        fakerInstance = new Faker({ locale: [en] });
        fakerInstance.seed(streamSeed);
      }
      return fakerInstance;
    },
  };
}

/**
 * An RFC 4122-shaped identifier drawn entirely from the given stream —
 * deterministic per (seed, path), unlike a real v4 uuid.
 */
export function deterministicUuid(stream: RandomStream): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (const ch of 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx') {
    if (ch === 'x') out += hex[stream.int(0, 15)];
    else if (ch === 'y') out += hex[8 + stream.int(0, 3)];
    else out += ch;
  }
  return out;
}

/**
 * One path segment, made safe to join on NUL.
 *
 * The join alone is not injective: a segment may contain NUL — unplanned
 * missingness passes a NUL-joined equality-group key beside an external roster
 * uid, and a caller's uid is an arbitrary string — so `stream('a', 'b\0c')`
 * and `stream('a\0b', 'c')` produced the same key. Two unrelated entities
 * then shared a stream and consumed each other's sequence, losing exactly the
 * isolation this source exists to give.
 *
 * Escaped rather than re-encoded (length-prefixing, say) so that a segment
 * containing neither NUL nor SOH is left BYTE-IDENTICAL. Stream seeds derive
 * from this key, so any other scheme would move every generated value in
 * every protocol — churning seeded fixtures and committed snapshots to fix a
 * case none of them contain.
 */
const escapeSegment = (segment: string): string =>
  segment.includes('\u0000') || segment.includes('\u0001')
    ? segment
        .replaceAll('\u0001', '\u0001\u0002')
        .replaceAll('\u0000', '\u0001\u0001')
    : segment;

export function createRandomSource(seed: number): RandomSource {
  const streams = new Map<string, RandomStream>();

  return {
    seed,
    stream(...path) {
      const pathKey = path.map(String).map(escapeSegment).join('\u0000');
      let stream = streams.get(pathKey);
      if (!stream) {
        stream = createStream(deriveStreamSeed(seed, pathKey));
        streams.set(pathKey, stream);
      }
      return stream;
    },
  };
}
