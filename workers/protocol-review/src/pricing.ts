import {
  DAILY_SPEND_CEILING_USD,
  MAX_OUTPUT_TOKENS,
  MONTHLY_SPEND_CEILING_USD,
  PROVIDER_MODELS,
  RESERVATION_OVERHEAD_TOKENS,
} from './constants.ts';
import type { ReviewProvider } from './contract.ts';

/**
 * Money is counted in whole millionths of a US dollar ("micro-dollars"), so
 * the limiter adds integers and never accumulates rounding error. A price in
 * dollars per million tokens is, conveniently, micro-dollars per token.
 *
 * Both ceilings are each provider's own.
 */
export const DAILY_CEILING_MICROS = Math.round(DAILY_SPEND_CEILING_USD * 1e6);

export const MONTHLY_CEILING_MICROS = Math.round(
  MONTHLY_SPEND_CEILING_USD * 1e6,
);

/**
 * What the provider reported billing for one call. The three input counts do
 * not overlap: together they are everything the call sent.
 */
export type TokenUsage = {
  /** Input charged at the ordinary price: neither written to nor read from a cache. */
  inputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  /** `null` when the call ended before the provider said how many. */
  outputTokens: number | null;
};

const micros = (tokens: number, pricePerMillion: number): number =>
  Math.ceil(tokens * pricePerMillion);

/**
 * The prices a request with `inputTokens` of input is charged at: the
 * provider's long-context prices when it has them and the input is over
 * their threshold, which then apply to the whole request.
 */
const pricesFor = (provider: ReviewProvider, inputTokens: number) => {
  const { prices, longContext } = PROVIDER_MODELS[provider];
  return longContext !== null && inputTokens > longContext.overInputTokens
    ? longContext
    : prices;
};

/**
 * The cost of a call, from its reported usage. An unknown output count is
 * charged at the output cap: the call may have been billed for all of it.
 */
export const costMicros = (
  provider: ReviewProvider,
  usage: TokenUsage,
): number => {
  const prices = pricesFor(
    provider,
    usage.inputTokens +
      usage.cacheCreationInputTokens +
      usage.cacheReadInputTokens,
  );
  return (
    micros(usage.inputTokens, prices.input) +
    micros(usage.cacheCreationInputTokens, prices.cacheWrite) +
    micros(usage.cacheReadInputTokens, prices.cacheRead) +
    micros(usage.outputTokens ?? MAX_OUTPUT_TOKENS, prices.output)
  );
};

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
 * real cost when the call ends. Where a provider charges more for a long
 * request, a bound over its threshold is reserved at those prices, since the
 * real count may be over it too.
 */
export const reservationMicros = (
  provider: ReviewProvider,
  texts: readonly string[],
): number => {
  const inputTokens =
    texts.reduce((bytes, text) => bytes + utf8.encode(text).byteLength, 0) +
    RESERVATION_OVERHEAD_TOKENS;
  const prices = pricesFor(provider, inputTokens);
  return (
    micros(inputTokens, prices.cacheWrite) +
    micros(MAX_OUTPUT_TOKENS, prices.output)
  );
};
