/**
 * The reproduction token a host reports for a generated batch, and reads back
 * to replay one.
 *
 * A batch is a pure function of TWO inputs: its seed, and the start-window
 * anchor its sessions are dated against. `generateInterviews` falls back to
 * the wall clock for the second, so a host that reported the seed alone would
 * be promising a replay the engine cannot deliver — the timestamps, and every
 * date-relative drawn value, would follow the day of the rerun. The token
 * carries both halves in one copyable string, `<seed>-<YYYY-MM-DD>`, so
 * "enter the value the batch reported" really does regenerate it byte for
 * byte.
 *
 * The anchor a host draws for a fresh batch is quantised to UTC midnight of
 * the current day ({@link freshBatchStartWindow}) precisely so a calendar day
 * is enough to reconstruct it exactly. Sessions still read as recent
 * fieldwork — they start within the schema's window before that midnight —
 * and nothing sub-day is lost, because nothing sub-day was ever drawn from
 * the clock.
 *
 * A bare `<seed>` also parses, without an anchor: a caller pinning only the
 * seed gets fresh dates around the day of the run, which is the engine's own
 * documented contract for an unpinned window.
 */

export type SyntheticBatchIdentity = {
  seed: number;
  /** ISO instant anchoring the start window; absent for a bare seed. */
  startWindow?: string;
};

const TOKEN_PATTERN = /^(\d{1,15})(?:-(\d{4}-\d{2}-\d{2}))?$/;

/** UTC midnight of `now`'s calendar day, as the engine's `startWindow` input. */
export const freshBatchStartWindow = (now: Date = new Date()): string =>
  `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;

/**
 * The token identifying a batch: its seed and the calendar day of its anchor.
 * The anchor is reported at day precision because that is its whole content —
 * hosts draw it through {@link freshBatchStartWindow}.
 */
export const formatSyntheticBatchToken = (
  seed: number,
  startWindow: string,
): string => `${seed}-${startWindow.slice(0, 10)}`;

/**
 * Read a token a researcher typed back in: `<seed>-<YYYY-MM-DD>` replays a
 * reported batch exactly, a bare `<seed>` pins only the draws. Anything else
 * is no token at all — `null`, so the caller can say so rather than guess.
 */
export const parseSyntheticBatchToken = (
  text: string,
): SyntheticBatchIdentity | null => {
  const match = TOKEN_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, seedText, day] = match;
  if (seedText === undefined) return null;
  const seed = Number.parseInt(seedText, 10);
  if (!Number.isSafeInteger(seed)) return null;
  if (day === undefined) return { seed };
  const startWindow = `${day}T00:00:00.000Z`;
  if (Number.isNaN(Date.parse(startWindow))) return null;
  return { seed, startWindow };
};
