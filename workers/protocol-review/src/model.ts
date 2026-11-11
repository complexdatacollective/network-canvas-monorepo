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
 * A model call that failed. `usage` is what the provider had billed when it
 * failed, as far as the call saw it: `null` when the provider never started
 * answering (nothing was billed), and an `outputTokens` of `null` when it
 * started but did not say how much it wrote.
 */
export class ModelCallError extends Error {
  readonly reason: ModelFailureReason;
  readonly status: number;
  readonly usage: TokenUsage | null;

  constructor(
    reason: ModelFailureReason,
    status: number,
    usage: TokenUsage | null,
  ) {
    super(`Model call failed: ${reason} (${status})`);
    this.name = 'ModelCallError';
    this.reason = reason;
    this.status = status;
    this.usage = usage;
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
