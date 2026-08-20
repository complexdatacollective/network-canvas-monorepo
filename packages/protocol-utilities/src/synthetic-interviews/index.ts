import { z } from 'zod';

import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { DEFAULT_SYNTHETIC_SEED, MAX_SYNTHETIC_INTERVIEWS } from './constants';
import { createSessionClock } from './session-engine/clock';
import { SessionEngine } from './session-engine/engine';
import {
  finaliseSession,
  type SyntheticInterviewResult,
} from './session-engine/envelope';
import { createSessionStreams } from './session-engine/streams';
import { simulateContentStage } from './simulators/contentStages';
import type { AssetData, SimulatorRegistry } from './simulators/types';
import { invariant } from './utils/invariant';
import { walkSession } from './walk/walk';

export type { SyntheticSessionAction } from './session-engine/actions';
export type { SyntheticInterviewResult } from './session-engine/envelope';
export type {
  AssetData,
  SimulationContext,
  StageSimulator,
} from './simulators/types';

/**
 * The one simulator per interface type (spec rule 1). A type absent here
 * makes the walk throw a structured error — never a silent fallthrough. The
 * per-interface simulators register as their phases land; the content stages
 * are the complete Phase-2 set.
 */
const REGISTRY: SimulatorRegistry = {
  Anonymisation: simulateContentStage,
  Information: simulateContentStage,
  Narrative: simulateContentStage,
};

export const generateInterviewsOptions = z
  .object({
    count: z.number().int().min(1).max(MAX_SYNTHETIC_INTERVIEWS),
    seed: z.number().optional().default(DEFAULT_SYNTHETIC_SEED),
    simulateDropOut: z.boolean().default(true),
    respectSkipLogic: z.boolean().default(true),
    /**
     * Regenerate dropped sessions (deterministically — the deficit session's
     * own substreams re-run with dropout disabled, the same participant
     * finishing) until this share of the batch is complete. 0 disables.
     */
    minimumCompletedRatio: z.number().min(0).max(1).default(0.1),
    /**
     * Stop the walk at a stage (and optionally a prompt bound: apply only
     * prompts strictly below it) instead of running to the end. Preview use;
     * mutually exclusive with dropout.
     */
    stopAt: z
      .object({
        stageIndex: z.number().int().min(0),
        promptIndex: z.number().int().min(0).optional(),
      })
      .optional(),
    /**
     * ISO instant anchoring the start window: sessions start uniformly within
     * the schema's `SYNTHETIC_START_WINDOW_DAYS` before it. Defaults to one
     * clock read per batch; pin it for byte-reproducible output across runs.
     */
    startWindow: z.string().optional(),
    /** Capture the engine's write trace for parity testing. */
    captureTrace: z.boolean().default(false),
  })
  .superRefine((options, ctx) => {
    if (options.stopAt && options.simulateDropOut) {
      ctx.addIssue({
        code: 'custom' as const,
        message:
          'stopAt and simulateDropOut are mutually exclusive: a stopped walk never rolls the dropout die',
        path: ['stopAt'],
      });
    }
  });

export type GenerateInterviewsOptions = z.input<
  typeof generateInterviewsOptions
>;

/**
 * Generate `count` synthetic interviews for a PARSED protocol, walking it
 * stage by stage as a participant would and returning complete
 * Interviewer-shaped sessions (spec: Public API). Drop-outs are genuine
 * abandoned sessions among the N (decision 11).
 *
 * `protocol` must be schema-parse output: stage-level `synthetic` descriptors
 * exist because parsing put them there, and the engine refuses rather than
 * re-defaults. Hosts parse at their generation boundary (plan D8/Phase 5).
 *
 * `assetData` carries host-resolved roster rows (stage-id keyed, the
 * three-way contract) and Geospatial property candidates; `onProgress` fires
 * after each session lands.
 */
export const generateInterviews = (
  protocol: CurrentProtocol,
  userOptions: GenerateInterviewsOptions,
  assetData: AssetData = {},
  onProgress?: (done: number, total: number) => void,
): SyntheticInterviewResult[] => {
  const options = generateInterviewsOptions.parse(userOptions);

  protocol.stages.forEach((stage) => {
    invariant(
      (stage as { synthetic?: unknown }).synthetic !== undefined,
      `stage "${stage.id}" declares no synthetic parameters — default parameters are supplied by parsing the protocol through the schema`,
    );
  });

  // Pre-seed refusal (rule 5) reconnects here in Phase 4, when the
  // descriptor-aware feasibility analysis is ported; the C12 corpus test
  // carries the failing `.todo` that pins the reconnection.

  // Walked once per batch: the answer is the same for every session.
  const interfaceRules = collectInterfaceImpliedRules(protocol);

  // One clock read per batch when the caller pins nothing, so a batch is
  // internally consistent; a pinned startWindow makes the run byte-stable.
  const startWindowAnchor = options.startWindow ?? new Date().toISOString();

  const generateOne = (
    index: number,
    simulateDropOut: boolean,
  ): SyntheticInterviewResult => {
    const streams = createSessionStreams(options.seed, index);
    const clock = createSessionClock(startWindowAnchor, streams);
    const engine = new SessionEngine({
      codebook: protocol.codebook,
      stages: protocol.stages,
      clock,
      egoUid: streams.uuid(),
      captureTrace: options.captureTrace,
    });

    const outcome = walkSession({
      stages: protocol.stages,
      registry: REGISTRY,
      context: {
        engine,
        streams,
        protocol,
        assetData,
        today: clock.startTime.slice(0, 10),
        interfaceRules,
      },
      clock,
      streams,
      respectSkipLogic: options.respectSkipLogic,
      simulateDropOut,
      stopAt: options.stopAt,
    });

    return finaliseSession({
      id: streams.uuid(),
      draft: engine.draft,
      clock,
      finished: outcome.finished,
      currentStep: outcome.currentStep,
      droppedOut: outcome.droppedOut,
      visitedStages: outcome.visitedStages,
      trace: engine.capturedTrace(),
    });
  };

  const results: SyntheticInterviewResult[] = [];
  for (let index = 0; index < options.count; index += 1) {
    results.push(generateOne(index, options.simulateDropOut));
    onProgress?.(index + 1, options.count);
  }

  // The completed floor (decision 20): a deficit session re-runs on its OWN
  // substreams with dropout disabled — the same participant finishing — so
  // the floor stays deterministic and sessions outside the deficit are
  // untouched.
  if (options.simulateDropOut && options.minimumCompletedRatio > 0) {
    const minimumCompleted = Math.max(
      1,
      Math.ceil(options.count * options.minimumCompletedRatio),
    );
    let completed = results.filter((result) => !result.droppedOut).length;
    for (
      let index = 0;
      index < options.count && completed < minimumCompleted;
      index += 1
    ) {
      if (!results[index]?.droppedOut) continue;
      results[index] = generateOne(index, false);
      completed += 1;
    }
  }

  return results;
};
