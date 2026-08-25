import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ConstraintConflict,
  SyntheticBatchIdentity,
} from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { SyntheticGenerationError } from '~/lib/syntheticExport/errors';
import type {
  SyntheticExportProgress,
  SyntheticExportSummary,
} from '~/lib/syntheticExport/generateSyntheticExport';
import { downloadBlob } from '~/utils/downloadBlob';
import { reportError } from '~/utils/reportError';
import { isSyntheticConstraintRefusal } from '~/utils/syntheticConstraintRefusal';

/**
 * The generation run behind the "Generate synthetic data…" dialog: one attempt
 * at a time, four outcomes, and no way for a finished run to write over a newer
 * one.
 *
 * A finished run holds its archive here rather than saving it, so it survives
 * until the researcher asks for it — and no longer: the run is cleared the
 * moment its surface opens or closes, or when another batch replaces it.
 */

const GENERIC_FAILURE_MESSAGE =
  'Something went wrong while generating synthetic data. Please try again.';

export type SyntheticGenerationState =
  | { status: 'idle' }
  | { status: 'running'; progress: SyntheticExportProgress }
  /** The engine proved the protocol can never generate. Its own conflicts. */
  | { status: 'refused'; conflicts: readonly ConstraintConflict[] }
  | { status: 'failed'; message: string }
  | {
      status: 'done';
      summary: SyntheticExportSummary;
      /**
       * Whether the researcher has taken a copy. Written by `saveArchive` and
       * nowhere else, so nothing can report a save that never happened.
       */
      saved: boolean;
    };

export type SyntheticGenerationRequest = {
  count: number;
  /**
   * The batch to replay, both halves of it. Omitted, a fresh seed and a fresh
   * day-quantised anchor are drawn and reported back; a `seed` without a
   * `startWindow` pins the draws and dates the sessions around today, which is
   * what a bare seed token means.
   */
  pinned?: SyntheticBatchIdentity;
  simulateDropOut: boolean;
  respectSkipLogic: boolean;
};

const IDLE: SyntheticGenerationState = { status: 'idle' };

export function useSyntheticGeneration({
  protocol,
  protocolId,
  open,
}: {
  protocol: CurrentProtocol | null;
  protocolId: string | null;
  /**
   * Whether the surface holding this run is on screen. Every change of it
   * clears the run — see the effect below, which is why this is the hook's
   * business rather than its caller's.
   */
  open: boolean;
}) {
  const [state, setState] = useState<SyntheticGenerationState>(IDLE);

  // Re-entry is guarded by a ref rather than by `state`: state updates are
  // scheduled, so two clicks in the same frame would both read `idle` and start
  // two batches — two archives, two seeds, one of them a surprise.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  /**
   * The run's stop switch, so an unmount ENDS it rather than merely ignoring
   * it. Suppressing the state updates was never enough: the interview loop and
   * the export pipeline carried on drawing a thousand sessions and building an
   * archive for a surface that had gone — a researcher who navigates away
   * mid-run left the tab paying for a file nobody will ever read.
   */
  const running = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      running.current?.abort();
    };
  }, []);

  const publish = useCallback((next: SyntheticGenerationState) => {
    if (mounted.current) setState(next);
  }, []);

  const reset = useCallback(() => {
    if (inFlight.current) return;
    setState(IDLE);
  }, []);

  /**
   * Every open AND every close starts a clean slate.
   *
   * Opening, because the previous run's outcome belongs to the batch that
   * produced it: a stale "Generated 10 interviews" above a fresh form reads as
   * though this one had already run. CLOSING, because a finished run is
   * holding a whole export archive — up to `MAX_SYNTHETIC_INTERVIEWS`
   * interviews of CSV and GraphML — and the surface that owns this hook stays
   * mounted for the rest of the editing session. Waiting for a reopen that may
   * never come meant carrying that archive until the tab was closed.
   *
   * Here rather than in the dialog because the archive is held here: whoever
   * owns the memory owns letting go of it.
   */
  useEffect(() => {
    reset();
  }, [open, reset]);

  const generate = useCallback(
    async (request: SyntheticGenerationRequest) => {
      if (inFlight.current) return;
      if (!protocol) {
        publish({
          status: 'failed',
          message: 'There is no open protocol to generate data from.',
        });
        return;
      }
      inFlight.current = true;
      const controller = new AbortController();
      running.current = controller;
      publish({ status: 'running', progress: { phase: 'preparing' } });
      try {
        // Loaded on demand. The generation engine, the export pipeline and its
        // ZIP and XML machinery are megabytes of code that only a researcher
        // who presses Generate ever needs; importing them from the toolbar
        // would put them in the boot path of every protocol page.
        const { generateSyntheticExport } =
          await import('~/lib/syntheticExport/generateSyntheticExport');
        const summary = await generateSyntheticExport({
          protocol,
          protocolId,
          count: request.count,
          // Spread rather than named: a `seed: undefined` key would read to the
          // engine's option parser as a pin at "undefined", and an absent
          // `startWindow` is what asks for a fresh anchor.
          ...request.pinned,
          simulateDropOut: request.simulateDropOut,
          respectSkipLogic: request.respectSkipLogic,
          signal: controller.signal,
          onProgress: (progress) => {
            if (mounted.current) setState({ status: 'running', progress });
          },
        });
        publish({ status: 'done', summary, saved: false });
      } catch (error) {
        // The run was stopped because its surface went. Nothing failed and
        // nobody is waiting on it, so there is no fault to report and nothing
        // to send to error reporting.
        if (controller.signal.aborted) return;
        // A refusal is the engine telling the researcher which of their own
        // rules cannot all hold. It is not a fault, it is the answer — and it
        // is rendered in the researcher's words, not paraphrased.
        if (isSyntheticConstraintRefusal(error)) {
          publish({ status: 'refused', conflicts: error.conflicts });
          return;
        }
        reportError(error);
        publish({
          status: 'failed',
          // Only messages written for a researcher are shown as they are;
          // anything else is internal wording and would mean nothing here.
          message:
            error instanceof SyntheticGenerationError
              ? error.message
              : GENERIC_FAILURE_MESSAGE,
        });
      } finally {
        inFlight.current = false;
        if (running.current === controller) running.current = null;
      }
    },
    [protocol, protocolId, publish],
  );

  /**
   * Save the archive the last run left waiting.
   *
   * Called straight from the researcher's click and from nothing else: the
   * browser only honours `downloadBlob` while the gesture that triggered it is
   * still live, so every hop between the click and this call has to be
   * synchronous. That click is also the only thing that records a save, so the
   * dialog cannot say "saved" before one has been asked for.
   */
  const saveArchive = useCallback(() => {
    if (state.status !== 'done') return;
    downloadBlob(state.summary.archive, state.summary.fileName);
    publish({ status: 'done', summary: state.summary, saved: true });
  }, [publish, state]);

  // `reset` is deliberately not returned: the effect above is the one thing
  // that clears a run, so no caller can leave the archive held by forgetting.
  return { state, generate, saveArchive };
}
