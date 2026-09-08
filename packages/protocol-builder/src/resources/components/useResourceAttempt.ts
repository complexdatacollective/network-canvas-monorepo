import { useCallback, useEffect, useRef, useState } from 'react';

import type { ResourceGatewayFailure, ResourceResult } from '../gateway.ts';
import { callGateway } from '../gatewayCall.ts';

/**
 * A place in the order of calls, taken before the work that leads to one
 * begins.
 *
 * Some calls are preceded by work of their own — reading a file the researcher
 * chose, for one — and that work can take longer for an earlier choice than
 * for a later one. Ordering by when the gateway call is made would let the
 * slower, older choice arrive last and win; ordering by when the researcher
 * chose is what this claims.
 */
export type ResourceAttemptClaim = Readonly<{
  /**
   * False once the researcher has asked for something else, and false once the
   * surface that asked has gone away.
   *
   * Both are the same fact — nobody is waiting for this any more — and the
   * claim is consulted before the call is made rather than after it answers,
   * so the second one has to count too: a claim that only watched for a newer
   * choice would go on to send a whole file to the host for an import there is
   * no longer anywhere to put.
   */
  current: () => boolean;
  /** Starts the claimed call, or does nothing if it was superseded. */
  run: <T>(
    operation: () => Promise<ResourceResult<T>>,
    onSuccess?: (data: T) => void,
    onAbandoned?: (data: T) => void,
  ) => void;
}>;

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
  /**
   * Runs one gateway call.
   *
   * `onAbandoned` receives what a *successful* call produced when nobody is
   * left to receive it — the researcher has since asked for something else, or
   * the surface that asked has gone away. Dropping such a result silently is
   * only safe for a read; a call that made something at the host leaves it
   * there with nothing knowing its id, so whatever it made is undone here.
   */
  run: <T>(
    operation: () => Promise<ResourceResult<T>>,
    onSuccess?: (data: T) => void,
    onAbandoned?: (data: T) => void,
  ) => void;
  /**
   * Takes the next place in the order before the call itself is ready, and
   * drops whatever the call it supersedes left on screen.
   */
  begin: () => ResourceAttemptClaim;
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
      onAbandoned?: (data: T) => void,
    ): void => {
      sequence.current += 1;
      const attempt = sequence.current;
      setState({ busy: true });

      const settle = async () => {
        // The call is made inside the helper rather than here: a gateway that
        // throws synchronously throws before there is a promise to attach a
        // `catch` to, and the exception would escape into a settling nothing
        // observes — leaving the control busy, with no failure and no retry,
        // for as long as the editor is open.
        const result = await callGateway(operation);
        // A result for a superseded call, or for a component that has since
        // gone away, decides nothing — but a successful one may have left
        // something at the host, and this is the last place that knows it
        // exists.
        if (!live.current || sequence.current !== attempt) {
          if (result.status === 'ok') onAbandoned?.(result.data);
          return;
        }
        if (result.status === 'failed') {
          setState({
            busy: false,
            failure: result.failure,
            ...(result.failure.retryable
              ? { retry: () => run(operation, onSuccess, onAbandoned) }
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

  const begin = useCallback((): ResourceAttemptClaim => {
    // Taken now, not when the call is made: the claim is the researcher's
    // choice, and the call is only its consequence.
    sequence.current += 1;
    const attempt = sequence.current;
    // What was on screen was about the choice this one replaces, so it goes
    // with it — including its retry, which would otherwise repeat the earlier
    // call and let it win over the choice that superseded it.
    setState(IDLE);
    // Liveness as well as order: an unmounted surface has left the order
    // rather than been overtaken in it, and nothing bumps the sequence on the
    // way out. Without this the work leading up to a call — reading the file
    // the researcher chose — would finish and dispatch it regardless.
    const current = (): boolean => live.current && sequence.current === attempt;
    return Object.freeze({
      current,
      run: <T>(
        operation: () => Promise<ResourceResult<T>>,
        onSuccess?: (data: T) => void,
        onAbandoned?: (data: T) => void,
      ): void => {
        if (!current()) return;
        run(operation, onSuccess, onAbandoned);
      },
    });
  }, [run]);

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
    begin,
    clear,
  };
}
