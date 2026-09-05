import { useCallback, useEffect, useRef, useState } from 'react';

import {
  resourceFailure,
  type ResourceGatewayFailure,
  type ResourceResult,
} from '../gateway.ts';

/**
 * What an adapter that rejects rather than reporting is turned into. The port
 * says failures arrive as results, so a rejection is the adapter breaking its
 * own contract — and the researcher still has to be told something true, in
 * their own terms, rather than being shown a host's exception.
 */
const UNREACHABLE_MESSAGE =
  'The resource could not be reached. Try again in a moment.';

export type ResourceAttempt = Readonly<{
  /** A call is in flight. */
  busy: boolean;
  /** The last call's failure, until another call starts or it is cleared. */
  failure?: ResourceGatewayFailure;
  /**
   * Repeats the identical call. Present only when the failure says repeating
   * it may still succeed — every such operation is either a read or carries a
   * stable request id, so a repeat cannot stage or promote anything twice.
   */
  retry?: () => void;
  run: <T>(
    operation: () => Promise<ResourceResult<T>>,
    onSuccess?: (data: T) => void,
  ) => void;
  clear: () => void;
}>;

type AttemptState = Readonly<{
  busy: boolean;
  failure?: ResourceGatewayFailure;
  retry?: () => void;
}>;

const IDLE: AttemptState = Object.freeze({ busy: false });

/**
 * One gateway call, its failure, and the retry that repeats it.
 *
 * Retry is held as the operation itself rather than as a description of it, so
 * "try again" is the same call with the same request id rather than a new
 * intent. It is dropped the moment the call succeeds: the closure holds
 * whatever the call carried, and for a staged secret that is the secret.
 */
export function useResourceAttempt(): ResourceAttempt {
  const [state, setState] = useState<AttemptState>(IDLE);
  const live = useRef(true);
  const sequence = useRef(0);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const run = useCallback(
    <T>(
      operation: () => Promise<ResourceResult<T>>,
      onSuccess?: (data: T) => void,
    ): void => {
      sequence.current += 1;
      const attempt = sequence.current;
      setState({ busy: true });

      const settle = async () => {
        const result = await operation().catch(() =>
          resourceFailure<T>('unavailable', UNREACHABLE_MESSAGE, {
            retryable: true,
          }),
        );
        // A result for a superseded call, or for a component that has since
        // gone away, decides nothing.
        if (!live.current || sequence.current !== attempt) return;
        if (result.status === 'failed') {
          setState({
            busy: false,
            failure: result.failure,
            ...(result.failure.retryable
              ? { retry: () => run(operation, onSuccess) }
              : {}),
          });
          return;
        }
        setState(IDLE);
        onSuccess?.(result.data);
      };

      void settle();
    },
    [],
  );

  const clear = useCallback(() => {
    // Anything still in flight is disowned as well, so a late failure cannot
    // reappear after the surface that asked for it has moved on.
    sequence.current += 1;
    setState(IDLE);
  }, []);

  return {
    busy: state.busy,
    ...(state.failure === undefined ? {} : { failure: state.failure }),
    ...(state.retry === undefined ? {} : { retry: state.retry }),
    run,
    clear,
  };
}
