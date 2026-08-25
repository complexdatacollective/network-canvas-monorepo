/**
 * Seeded randomness for one simulated session, split into independent
 * substreams so adding a draw in one place never perturbs another (spec's
 * Determinism section). The value stream is NOT here — variable values come
 * from the constraint machinery's own seeded `ValueGenerator` — these streams
 * cover everything else: entity ids, counts, coins, dropout dice, the clock.
 *
 * The generators are deliberately tiny and self-contained (splitmix32 to
 * derive stream seeds, mulberry32 to draw) rather than faker instances:
 * ids and dice need uniform bits, not personas, and a dependency-free
 * generator keeps the determinism contract auditable in one screen of code.
 */

const IDS = 'ids';
const COUNTS = 'counts';
const COINS = 'coins';
const DROPOUT = 'dropout';
const CLOCK = 'clock';
const GEO = 'geo';

const STREAM_NAMES = [IDS, COUNTS, COINS, DROPOUT, CLOCK, GEO] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/** FNV-1a over the stream name, so each name lands a distinct lane. */
const hashName = (name: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** splitmix32: one step mixes a 32-bit state into a well-distributed word. */
const splitmix32 = (state: number): number => {
  let z = (state + 0x9e3779b9) >>> 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x21f0aaad);
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97);
  z ^= z >>> 15;
  return z >>> 0;
};

/** mulberry32: the per-stream generator, uniform on [0, 1). */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const HEX = '0123456789abcdef';

/** The tag a batch's seed is mixed with to make the batch's own word. */
const BATCH_TAG = splitmix32(0);

/** The word a batch contributes before any session position is folded in. */
const batchWord = (seed: number): number =>
  splitmix32((splitmix32(seed >>> 0) ^ BATCH_TAG) >>> 0);

/**
 * Fold a session's position into a batch word, in that order.
 *
 * Ordered rather than symmetric, and that is the whole point. A commutative
 * mix (`f(seed) ^ f(index)`) reads the batch seed and the session position as
 * a SET, so batch 1's session 2 and batch 2's session 1 land on one state:
 * two batches reporting different tokens would hand back sessions carrying
 * identical ids, values, timestamps and case identifiers — duplicating
 * experimental rows, and making a host that keys participants by those
 * identifiers fold the colliding pair into one person. Here the seed is mixed
 * into a word of its own first and the position folded into that word after,
 * so a position can never stand in for a seed.
 *
 * Position 0 IS the batch, and takes the batch's own word rather than one
 * derived from it: a single-interview run — every builder recipe, every
 * preview — never touches the position machinery at all.
 */
const atPosition = (batch: number, index: number): number =>
  index === 0 ? batch : splitmix32((batch ^ splitmix32(index >>> 0)) >>> 0);

/**
 * The seed a session's persona generator (`ValueGenerator`) runs from.
 *
 * The values themselves are not drawn here — the constraint machinery keeps
 * its own faker — but WHICH batch position a generator speaks for is this
 * module's question, and it is answered by the same ordered derivation the
 * substreams use, in a lane of its own so the two never walk one word.
 * Position 0 runs from the batch seed itself.
 */
export const sessionValueSeed = (seed: number, index: number): number =>
  index === 0
    ? seed >>> 0
    : atPosition(splitmix32((seed >>> 0) ^ hashName('values')), index);

export type SessionStreams = {
  /** Uniform [0, 1) draw from the named stream. */
  draw: (stream: StreamName) => number;
  /** Integer in [min, max], inclusive both ends. */
  int: (stream: StreamName, min: number, max: number) => number;
  /** A uuid-v4-formatted id from the id stream (RFC 4122 shape, seeded). */
  uuid: () => string;
  /** Standard normal via Box–Muller on the named stream (two draws). */
  normal: (stream: StreamName) => number;
};

/**
 * Streams for session `index` of a batch seeded with `seed`. Session 0 of a
 * batch draws identically to a single-interview run with the same seed, and
 * appending sessions to a batch never changes the ones before them.
 */
export const createSessionStreams = (
  seed: number,
  index: number,
): SessionStreams => {
  const sessionState = atPosition(batchWord(seed), index);
  const generators = new Map<StreamName, () => number>(
    STREAM_NAMES.map((name) => [
      name,
      mulberry32(splitmix32(sessionState ^ hashName(name))),
    ]),
  );

  const draw = (stream: StreamName): number => {
    const generator = generators.get(stream);
    if (!generator) throw new Error(`Unknown stream "${stream}"`);
    return generator();
  };

  return {
    draw,
    int: (stream, min, max) => min + Math.floor(draw(stream) * (max - min + 1)),
    uuid: () => {
      let id = '';
      for (let position = 0; position < 36; position += 1) {
        if (
          position === 8 ||
          position === 13 ||
          position === 18 ||
          position === 23
        ) {
          id += '-';
        } else if (position === 14) {
          id += '4';
        } else if (position === 19) {
          id += HEX[8 + Math.floor(draw(IDS) * 4)];
        } else {
          id += HEX[Math.floor(draw(IDS) * 16)];
        }
      }
      return id;
    },
    normal: (stream) => {
      // Box–Muller; the 1 - draw() keeps log() away from zero.
      const u = 1 - draw(stream);
      const v = draw(stream);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
};
