import {
  DAILY_SPEND_CEILING_USD,
  MAX_OUTPUT_TOKENS,
  MONTHLY_SPEND_CEILING_USD,
  MODEL_PRICES_USD_PER_MILLION_TOKENS as PRICES,
  RESERVATION_OVERHEAD_TOKENS,
} from './constants.ts';

/**
 * Money is counted in whole millionths of a US dollar ("micro-dollars"), so
 * the limiter adds integers and never accumulates rounding error. A price in
 * dollars per million tokens is, conveniently, micro-dollars per token.
 */
export const DAILY_CEILING_MICROS = Math.round(DAILY_SPEND_CEILING_USD * 1e6);

export const MONTHLY_CEILING_MICROS = Math.round(
  MONTHLY_SPEND_CEILING_USD * 1e6,
);

/** What the provider reported billing for one call. */
export type TokenUsage = {
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  /** `null` when the call ended before the provider said how many. */
  outputTokens: number | null;
};

const micros = (tokens: number, pricePerMillion: number): number =>
  Math.ceil(tokens * pricePerMillion);

/**
 * The cost of a call, from its reported usage. An unknown output count is
 * charged at the output cap: the call may have been billed for all of it.
 */
export const costMicros = (usage: TokenUsage): number =>
  micros(usage.inputTokens, PRICES.input) +
  micros(usage.cacheCreationInputTokens, PRICES.cacheWrite) +
  micros(usage.cacheReadInputTokens, PRICES.cacheRead) +
  micros(usage.outputTokens ?? MAX_OUTPUT_TOKENS, PRICES.output);

const utf8 = new TextEncoder();

/**
 * The most a call sending these texts can cost: every input token at the
 * highest input price (a cache write), and the whole output cap.
 *
 * The input is bounded by bytes, not by an average: the tokenizer works on
 * UTF-8 bytes and every token stands for at least one of them, so a text
 * cannot cost more tokens than its UTF-8 length, whatever its language or
 * how dense it is (Chinese, emoji and random ids run near a token a
 * character, and English near four characters a token). `texts` must be
 * everything the request carries: the system prompt, the user message and
 * the output schema. `RESERVATION_OVERHEAD_TOKENS` covers the framing the API
 * adds around them.
 *
 * The bound over-reserves ordinary text two to four times, which costs only
 * some concurrency near the ceiling: the reservation is settled down to the
 * real cost when the call ends.
 */
export const reservationMicros = (texts: readonly string[]): number => {
  const inputTokens =
    texts.reduce((bytes, text) => bytes + utf8.encode(text).byteLength, 0) +
    RESERVATION_OVERHEAD_TOKENS;
  return (
    micros(inputTokens, PRICES.cacheWrite) +
    micros(MAX_OUTPUT_TOKENS, PRICES.output)
  );
};
