import type { TokenUsage } from './pricing.ts';

/**
 * The model call as the review handler sees it, so the handler can be tested
 * with a fake and each provider's real call (`anthropic-model.ts`,
 * `openai-model.ts`) stays thin.
 */

/** Why the model call did not produce a review, as a fixed code. */
export type ModelFailureReason =
  | 'authentication'
  | 'permission'
  | 'billing'
  | 'rate_limited'
  | 'overloaded'
  | 'provider_error'
  | 'bad_request'
  | 'request_too_large'
  | 'not_found'
  | 'connection'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

/** The reason an HTTP error status from a provider stands for. */
export const reasonByStatus = (status: number): ModelFailureReason => {
  if (status === 401) return 'authentication';
  if (status === 402) return 'billing';
  if (status === 403) return 'permission';
  if (status === 404) return 'not_found';
  if (status === 413) return 'request_too_large';
  if (status === 429) return 'rate_limited';
  if (status === 529) return 'overloaded';
  if (status === 400) return 'bad_request';
  if (status >= 500) return 'provider_error';
  return 'unknown';
};

/**
 * What the provider may have billed for a call that failed.
 *
 * - `rejected`: the provider answered with an HTTP error status before any
 *   answer began. That is the one failure confirmed to have billed nothing.
 * - `reported`: the provider began answering and reported its input at the
 *   start; `outputTokens` is `null` when it did not say how much it wrote.
 * - `unknown`: anything else, such as a lost connection, a timeout or a
 *   cancellation before the answer began. The request may have reached the
 *   provider and been billed, so the whole reservation is kept.
 */
export type FailedCallBilling =
  | { kind: 'rejected' }
  | { kind: 'reported'; usage: TokenUsage }
  | { kind: 'unknown' };

export const REJECTED: FailedCallBilling = { kind: 'rejected' };
export const BILLING_UNKNOWN: FailedCallBilling = { kind: 'unknown' };
export const reported = (usage: TokenUsage): FailedCallBilling => ({
  kind: 'reported',
  usage,
});

/** A model call that failed, and what the provider may have billed for it. */
export class ModelCallError extends Error {
  readonly reason: ModelFailureReason;
  readonly status: number;
  readonly billing: FailedCallBilling;

  constructor(
    reason: ModelFailureReason,
    status: number,
    billing: FailedCallBilling,
  ) {
    super(`Model call failed: ${reason} (${status})`);
    this.name = 'ModelCallError';
    this.reason = reason;
    this.status = status;
    this.billing = billing;
  }
}

export type ModelRunInput = {
  /** The cached, unchanging instructions. */
  system: string;
  /** This review's request: the study details and the protocol. */
  user: string;
  /** Aborted when the client disconnects or the review times out. */
  signal: AbortSignal;
  /** Called once, when the provider has accepted the request and begun. */
  onStart: () => void;
  /**
   * Called with each piece of the provider's summary of the model's thinking,
   * which comes before the answer. Only its length is used, to show that the
   * review is moving; a provider that gives no summary never calls it.
   */
  onThinking: (chunk: string) => void;
  /** Called with each piece of the answer as it arrives. */
  onText: (chunk: string) => void;
};

export type ModelRunOutput = {
  /** The whole answer. */
  text: string;
  /**
   * Why the model stopped, in one vocabulary whichever provider answered:
   * `end_turn`, `max_tokens` (the answer was cut off at the output cap),
   * `refusal`, or whatever else the provider reported.
   */
  stopReason: string | null;
  usage: TokenUsage;
};

/** Runs the review. Throws `ModelCallError` when it fails. */
export type ReviewModel = (input: ModelRunInput) => Promise<ModelRunOutput>;
