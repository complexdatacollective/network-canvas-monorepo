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
 * until the researcher asks for it — until the dialog is closed, or until
 * another batch replaces it.
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
}: {
  protocol: CurrentProtocol | null;
  protocolId: string | null;
}) {
  const [state, setState] = useState<SyntheticGenerationState>(IDLE);

  // Re-entry is guarded by a ref rather than by `state`: state updates are
  // scheduled, so two clicks in the same frame would both read `idle` and start
  // two batches — two archives, two seeds, one of them a surprise.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const publish = useCallback((next: SyntheticGenerationState) => {
    if (mounted.current) setState(next);
  }, []);

  const reset = useCallback(() => {
    if (inFlight.current) return;
    setState(IDLE);
  }, []);

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
          onProgress: (progress) => {
            if (mounted.current) setState({ status: 'running', progress });
          },
        });
        publish({ status: 'done', summary, saved: false });
      } catch (error) {
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

  return { state, generate, reset, saveArchive };
}
