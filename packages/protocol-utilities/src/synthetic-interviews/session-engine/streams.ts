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
  const sessionState = splitmix32(
    splitmix32(seed >>> 0) ^ splitmix32(index >>> 0),
  );
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
