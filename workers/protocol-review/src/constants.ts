/**
 * The service's fixed settings. None of them is read from the environment:
 * a limit or a price that could be changed without a code review could be
 * changed by mistake, and the budget is the thing this Worker exists to
 * defend.
 */

import type { ReviewProvider } from './contract.ts';

/**
 * The most the service may spend with one provider in one UTC calendar month,
 * in US dollars. This is that provider's whole budget: the API key the
 * service calls it with carries the same monthly limit, and the service must
 * reach its own first, so that a researcher is told when reviews start again
 * rather than that the service is unavailable. The providers' budgets are
 * separate: one that is spent leaves the other available.
 */
export const MONTHLY_SPEND_CEILING_USD = 200;

/**
 * The most the service may spend with one provider in one UTC day, in US
 * dollars: a tenth of the month. Without it, a script that forges Architect's
 * origin could spend the whole month in an afternoon and close the provider
 * until the next one. With it, the worst day costs a tenth, and the team has
 * the days that follow to notice (see the README, "Changing the spending
 * ceilings").
 */
export const DAILY_SPEND_CEILING_USD = 20;

/** A model's prices, in US dollars per million tokens. */
type ModelPrices = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

type ProviderModel = {
  /** The model that writes this provider's reviews. */
  model: string;
  /** How hard the model thinks before it answers. */
  effort: 'medium' | 'high';
  prices: ModelPrices;
  /**
   * The prices of a whole request whose input is over `overInputTokens`, for
   * a provider that charges more for a long one; null for one that does not.
   */
  longContext: ({ overInputTokens: number } & ModelPrices) | null;
};

/**
 * Each provider's model and its first-party API prices.
 *
 * - Anthropic: Claude Opus 5.5. Cache writes use the five-minute lifetime,
 *   which costs 1.25 times the input price. A typical review (a protocol of
 *   50–150 KB and a full answer) costs roughly $0.30–$0.80, so the month
 *   allows on the order of 250–650 reviews.
 * - OpenAI: GPT-6.1 Sol, which OpenAI describes as near its flagship for
 *   complex work at a fifth of the price. Cache writes use the 30-minute
 *   lifetime, also 1.25 times the input price. At half Opus 5.5's prices the
 *   month allows roughly twice as many reviews. A request with more than
 *   272,000 input tokens is charged at the long-context prices throughout.
 *
 * Reviewing a design rewards thoroughness, so Claude thinks at `high`. GPT-6.1
 * Sol thinks at `medium`: at `high` it reasoned for about seven minutes over
 * a nine-stage protocol before writing anything, which left a larger
 * protocol no room inside `MODEL_TIMEOUT_MS`.
 */
export const PROVIDER_MODELS = {
  anthropic: {
    model: 'claude-opus-5-5',
    effort: 'high',
    prices: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
    longContext: null,
  },
  openai: {
    model: 'gpt-6.1-sol',
    effort: 'medium',
    prices: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
    longContext: {
      overInputTokens: 272_000,
      input: 4,
      output: 15,
      cacheWrite: 5,
      cacheRead: 0.2,
    },
  },
} as const satisfies Record<ReviewProvider, ProviderModel>;

/**
 * The most tokens one review may produce, thinking included. Twelve findings
 * with their fixes take roughly 10,000–20,000 tokens of answer; the rest is
 * room for the model to think. At Opus 5.5's $20 per million this caps one
 * answer at $0.80.
 */
export const MAX_OUTPUT_TOKENS = 40_000;

/** The most findings one review returns. */
export const MAX_FINDINGS = 12;

/**
 * How long one review may take before it is abandoned, in milliseconds. A
 * thorough review of a large protocol takes a few minutes.
 */
export const MODEL_TIMEOUT_MS = 8 * 60 * 1000;

/** The shortest gap between two progress events, in milliseconds. */
export const PROGRESS_INTERVAL_MS = 250;

/**
 * The longest the stream stays silent, in milliseconds. While the model
 * thinks it writes nothing, so a progress event repeats the count to keep the
 * connection from being closed as idle.
 */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * Tokens added to every reservation for the framing the API puts around the
 * text it is sent: role and turn markers, the thinking and structured-output
 * settings. The text itself is reserved at one token per UTF-8 byte (see
 * `reservationMicros`), which is already an upper bound; this allowance
 * covers only what is not in that text.
 */
export const RESERVATION_OVERHEAD_TOKENS = 1_000;

/** The PostHog endpoint failure notices are sent to. */
export const POSTHOG_CAPTURE_URL = 'https://us.i.posthog.com/capture/';

/** The PostHog event that tells the team the model provider failed. */
export const SERVICE_FAILURE_EVENT = 'protocol_review_service_failure';

/** The fixed `distinct_id` of every event this service sends. */
export const ANALYTICS_DISTINCT_ID = 'protocol-review-worker';

/** The one Durable Object instance that holds every limit's state. */
export const LIMITER_INSTANCE_NAME = 'global';
