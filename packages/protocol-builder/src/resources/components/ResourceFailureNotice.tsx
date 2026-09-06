import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';

import type { ResourceGatewayFailure } from '../gateway.ts';

export type ResourceFailureNoticeProps = Readonly<{
  failure: ResourceGatewayFailure;
  /** Repeats the identical call. Offered only for a retryable failure. */
  onRetry?: () => void;
  /**
   * Accessible name of the retry control. Several surfaces of one picker can
   * be failing at once — the library it is browsing, the resource it holds —
   * so each says what it would retry.
   */
  retryLabel?: string;
  busy?: boolean;
}>;

/**
 * What went wrong, in the gateway's own researcher-facing words.
 *
 * The message is rendered verbatim and nothing else about the failure is:
 * the port promises a message that names the researcher's situation rather
 * than a bucket, a database, or an HTTP status, and an editor that
 * embellished it would be inventing detail it does not have.
 */
export default function ResourceFailureNotice({
  failure,
  onRetry,
  retryLabel = 'Try again',
  busy = false,
}: ResourceFailureNoticeProps) {
  const canRetry = failure.retryable && onRetry !== undefined;

  return (
    <Alert variant="destructive" density="compact" className="my-2">
      <div className="flex flex-wrap items-center gap-3">
        <AlertDescription>{failure.message}</AlertDescription>
        {canRetry && (
          <Button
            type="button"
            size="sm"
            color="destructive"
            variant="outline"
            disabled={busy}
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        )}
      </div>
    </Alert>
  );
}
