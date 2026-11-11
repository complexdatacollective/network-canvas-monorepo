/**
 * The service's fixed settings. None of them is read from the environment:
 * a limit or a price that could be changed without a code review could be
 * changed by mistake, and the budget is the thing this Worker exists to
 * defend.
 */

/**
 * The most the service may spend on the model in one UTC day, in US dollars.
 *
 * A typical review (a protocol of 50–150 KB and a full answer) costs roughly
 * $0.30–$0.80, so this allows on the order of 30–80 reviews a day, which is
 * well above what an experimental feature should see, while capping the
 * worst day at a sum nobody has to explain. Adjust it once real usage has
 * been measured (see the README, "Changing the daily ceiling").
 */
export const DAILY_SPEND_CEILING_USD = 25;

/** The model that writes reviews (Claude Opus 5.5). */
export const REVIEW_MODEL = 'claude-opus-5-5';

/**
 * The model's prices, in US dollars per million tokens (Anthropic's
 * first-party API rates for Claude Opus 5.5). Cache writes use the
 * five-minute lifetime, which costs 1.25 times the input price; cache reads
 * cost $0.20.
 */
export const MODEL_PRICES_USD_PER_MILLION_TOKENS = {
  input: 4,
  output: 20,
  cacheWrite: 5,
  cacheRead: 0.2,
} as const;

/**
 * The most tokens one review may produce, thinking included. Twelve findings
 * with their fixes take roughly 10,000–20,000 tokens of answer; the rest is
 * room for the model to think. At $20 per million this caps one answer at
 * $0.80.
 */
export const MAX_OUTPUT_TOKENS = 40_000;

/** How hard the model thinks. Reviewing a design rewards thoroughness. */
export const REVIEW_EFFORT = 'high';

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
 * Characters of prompt per token assumed when reserving budget before the
 * call. Real English prose runs at about four characters a token; protocol
 * JSON, full of ids and punctuation, runs denser. Two is deliberately
 * pessimistic, so a reservation covers the real cost.
 */
export const RESERVATION_CHARS_PER_TOKEN = 2;

/** Tokens added to every reservation for message framing. */
export const RESERVATION_OVERHEAD_TOKENS = 1_000;

/** The PostHog endpoint failure notices are sent to. */
export const POSTHOG_CAPTURE_URL = 'https://us.i.posthog.com/capture/';

/** The PostHog event that tells the team the model provider failed. */
export const SERVICE_FAILURE_EVENT = 'protocol_review_service_failure';

/** The fixed `distinct_id` of every event this service sends. */
export const ANALYTICS_DISTINCT_ID = 'protocol-review-worker';

/** The one Durable Object instance that holds every limit's state. */
export const LIMITER_INSTANCE_NAME = 'global';
