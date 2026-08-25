import { getInterviewProgress } from '@codaco/interview';
import {
  freshBatchStartWindow,
  generateInterviews,
} from '@codaco/protocol-utilities';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { StageMetadataSchema } from '@codaco/shared-consts';
import {
  createSession,
  deleteSessions,
  getProtocolByHash,
  updateSession,
} from '~/lib/db/api';
import type { StoredProtocol } from '~/lib/db/types';

import { loadSyntheticAssetData } from './loadAssetData';

/**
 * Generation runs in two phases the researcher can tell apart: the engine
 * draws the whole batch in one synchronous call, then each session is
 * encrypted and written. Reporting them separately keeps the progress bar
 * honest — a long pause before the first row lands is the draw, not a stall.
 */
export type SyntheticGenerationProgress = {
  phase: 'generating' | 'storing';
  current: number;
  total: number;
};

type GenerateOptions = {
  protocolHash: string;
  count: number;
  simulateDropOut: boolean;
  /**
   * The settings dialog's combined toggle: skip logic AND stage filters
   * together, exactly as its label promises. Threaded to both of the
   * engine's flags.
   */
  respectSkipLogic: boolean;
  /** Pin the batch. Omitted, a fresh random seed is drawn and reported back. */
  seed?: number;
  /**
   * Pin the batch's start-window anchor. Omitted, a fresh day-quantised
   * anchor is drawn ({@link freshBatchStartWindow}) and reported back — the
   * seed alone does not identify a batch, because session dates and every
   * date-relative drawn value follow the anchor.
   */
  startWindow?: string;
  onProgress?: (progress: SyntheticGenerationProgress) => void;
};

export type SyntheticGenerationSummary = {
  created: number;
  /** The seed the batch actually ran on. */
  seed: number;
  /** The anchor it ran against; with the seed, the batch's whole identity. */
  startWindow: string;
};

/**
 * A fresh seed for a batch nobody pinned.
 *
 * This is the one place in synthetic generation where entropy is allowed: the
 * engine itself is a pure function of its seed, which is what makes a batch
 * reproducible, so the unrepeatable part has to be chosen by the host and
 * handed back to the researcher. A 32-bit integer is short enough to read off
 * a toast and type into the seed field.
 */
function drawSeed(): number {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return value ?? 0;
}

/**
 * Re-parse the stored protocol through the current schema.
 *
 * The engine refuses a stage that declares no `synthetic` parameters, because
 * those parameters are supplied by parsing rather than by defaulting inside
 * the engine — one model of what a stage generates, owned by the schema. A
 * stored protocol is whatever the schema looked like on the day it was
 * imported, so generation parses it again here rather than trusting the row.
 */
function parseStoredProtocol(protocol: StoredProtocol) {
  const result = CurrentProtocolSchema.safeParse(protocol.protocol);
  if (!result.success) {
    throw new Error(
      `"${protocol.name}" could not be read by the current protocol schema, so synthetic data cannot be generated for it. Re-import the protocol and try again.`,
      { cause: result.error },
    );
  }
  return result.data;
}

export async function generateSyntheticSessions(
  opts: GenerateOptions,
): Promise<SyntheticGenerationSummary> {
  const { protocolHash, count, simulateDropOut, respectSkipLogic, onProgress } =
    opts;

  const protocol = await getProtocolByHash(protocolHash);
  if (!protocol) {
    throw new Error(`Protocol not found for hash "${protocolHash}".`);
  }

  const parsed = parseStoredProtocol(protocol);
  const assetData = await loadSyntheticAssetData(protocol);
  const seed = opts.seed ?? drawSeed();
  const startWindow = opts.startWindow ?? freshBatchStartWindow();

  // Nothing is written yet, so a refusal here — the engine proves up front
  // that the protocol's validation rules cannot all be satisfied — leaves
  // storage untouched and needs no rollback. The completed floor and every
  // retry live inside the engine: it re-runs a dropped session on its own
  // substreams rather than drawing a fresh one, so the batch stays a pure
  // function of `seed` and `startWindow` together.
  const results = generateInterviews(
    parsed,
    {
      count,
      seed,
      startWindow,
      simulateDropOut,
      respectSkipLogic,
      // One host toggle, both engine flags: the setting's label has always
      // promised "skip logic and filtering", and stage filters are the
      // second half of that promise.
      respectFiltering: respectSkipLogic,
    },
    assetData,
    (current, total) => onProgress?.({ phase: 'generating', current, total }),
  );

  const written: string[] = [];

  try {
    for (const [index, result] of results.entries()) {
      const { session, currentStep } = result;

      const stored = await createSession({
        protocolHash,
        protocolName: protocol.name,
        // The engine's own session id, so a pinned seed reproduces the batch
        // down to the case ids a researcher sees in the interview table.
        caseId: `synthetic-${session.id}`,
        initialNetwork: session.network,
        isSynthetic: true,
      });

      // Record the row before filling it in: `createSession` has already
      // committed it, so a rejected `updateSession` (a failed encryption or
      // IndexedDB write) has to roll this row back too, not just its
      // predecessors.
      written.push(stored.id);

      await updateSession(stored.id, {
        currentStep,
        progress: getInterviewProgress(parsed.stages, currentStep).progress,
        stageMetadata:
          session.stageMetadata === undefined
            ? undefined
            : StageMetadataSchema.parse(session.stageMetadata),
        // The engine's clock, not this device's: sessions start spread across
        // the days before now and finish after however long their stages
        // would have taken, so a batch looks like fieldwork rather than like
        // one instant. A drop-out has no finish time at all — it is a genuine
        // unfinished session, resumable exactly like an abandoned real one.
        // `lastUpdatedAt` stays the write time: `updateSession` stamps it for
        // every caller, and a synthetic row is not worth a second write path.
        startedAt: session.startTime,
        finishedAt: session.finishTime,
      });

      onProgress?.({
        phase: 'storing',
        current: index + 1,
        total: results.length,
      });
    }
  } catch (error) {
    // A write failed part-way through a batch that has already committed
    // rows. Undo them: nothing is kept unless the whole batch succeeded, so a
    // retry can't stack a partial duplicate batch on top of the first attempt.
    try {
      await deleteSessions(written);
    } catch {
      // A failing rollback means the database itself is broken; the write
      // failure is still the actionable error, and the caller re-reads the
      // stored count either way, so the number on screen stays honest.
    }
    throw error;
  }

  return { created: results.length, seed, startWindow };
}
