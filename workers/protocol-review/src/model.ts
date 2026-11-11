import type { TokenUsage } from './pricing.ts';

/**
 * The model call as the review handler sees it, so the handler can be tested
 * with a fake and the real call (`anthropic-model.ts`) stays thin.
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
  /** Called with each piece of the answer as it arrives. */
  onText: (chunk: string) => void;
};

export type ModelRunOutput = {
  /** The whole answer. */
  text: string;
  /** Why the model stopped: `end_turn`, `max_tokens`, `refusal`, … */
  stopReason: string | null;
  usage: TokenUsage;
};

/** Runs the review. Throws `ModelCallError` when it fails. */
export type ReviewModel = (input: ModelRunInput) => Promise<ModelRunOutput>;
