import { posthog } from '~/analytics';
import { ensureError } from '~/utils/ensureError';

/**
 * Central error-reporting entry point for architect-web.
 *
 * Call sites depend on this rather than the PostHog SDK directly, giving us one
 * place to normalize thrown values, attach context, swap the backend, or
 * rate-limit. Returns the normalized `Error` so callers can reuse it (e.g. for
 * a dialog message) without normalizing twice.
 *
 * This handles errors that are caught and would otherwise be swallowed.
 * Uncaught errors are still reported automatically via PostHog's exception
 * autocapture and the React error boundary.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): Error {
  const normalizedError = ensureError(error);
  posthog.captureException(normalizedError, context);
  return normalizedError;
}
