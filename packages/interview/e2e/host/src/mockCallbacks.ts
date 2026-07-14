import type {
  AssetRequestHandler,
  FinishHandler,
  SyncHandler,
} from '../../../src/contract/types';

// The Shell is a self-contained Redux island in the e2e host. There is no
// remote sink for sessions — Playwright reads state straight from the live
// Redux store via window.__interviewStore. So sync is a no-op.
export const mockSync: SyncHandler = async (): Promise<void> => {};

/**
 * Configurable behavior for the instrumented onFinish mock, set from
 * Playwright via window.__test.setFinishBehavior(). 'manual' is used by
 * scenarios that need to assert the dialog's pending state before deciding
 * whether to resolve or reject — no real or virtual timers involved.
 *
 * The default is `{ mode: 'resolve' }`, which resolves immediately and so is
 * behaviourally identical to the previous no-op handler. Every other failure
 * mode is opt-in: a suite only sees non-default behaviour if it explicitly
 * calls setFinishBehavior().
 */
export type FinishBehavior =
  | { mode: 'resolve' }
  | { mode: 'reject'; message: string }
  | { mode: 'manual' }
  | { mode: 'hang-until-abort' };

type FinishCallRecord = { interviewId: string; aborted: boolean };

let finishBehavior: FinishBehavior = { mode: 'resolve' };
let finishCalls: FinishCallRecord[] = [];
let manualResolve: (() => void) | null = null;
let manualReject: ((reason: unknown) => void) | null = null;

export function setFinishBehavior(behavior: FinishBehavior): void {
  finishBehavior = behavior;
}

/** Resolves a pending 'manual' mode call. No-op if none is pending. */
export function resolveManualFinish(): void {
  manualResolve?.();
}

/** Rejects a pending 'manual' mode call with Error(message). No-op if none is pending. */
export function rejectManualFinish(message: string): void {
  manualReject?.(new Error(message));
}

export function getFinishCalls(): FinishCallRecord[] {
  return finishCalls;
}

/**
 * Restore the default (resolve) behaviour and clear recorded calls. Called from
 * testHooks.reset() so a reused page can never leak finish state between tests.
 */
export function resetFinishInstrumentation(): void {
  finishBehavior = { mode: 'resolve' };
  finishCalls = [];
  manualResolve = null;
  manualReject = null;
}

export const mockFinish: FinishHandler = async (
  interviewId: string,
  signal: AbortSignal,
): Promise<void> => {
  const behavior = finishBehavior;
  const call: FinishCallRecord = { interviewId, aborted: false };
  finishCalls.push(call);

  const onAbort = () => {
    call.aborted = true;
  };
  signal.addEventListener('abort', onAbort);

  try {
    if (behavior.mode === 'resolve') return;

    if (behavior.mode === 'reject') {
      throw new Error(behavior.message);
    }

    if (behavior.mode === 'manual') {
      await new Promise<void>((resolve, reject) => {
        manualResolve = resolve;
        manualReject = reject;
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return;
    }

    // 'hang-until-abort': never resolves on its own; only the AbortSignal
    // settles it, mirroring a real network request cancelled by the dialog.
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
    manualResolve = null;
    manualReject = null;
  }
};

export function makeMockAssetRequest(
  assetUrls: Map<string, string>,
): AssetRequestHandler {
  return async (assetId: string): Promise<string> => {
    const url = assetUrls.get(assetId);
    if (!url) throw new Error(`No URL registered for asset ${assetId}`);
    return url;
  };
}
