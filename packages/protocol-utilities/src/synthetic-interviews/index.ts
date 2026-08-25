import { z } from 'zod';

import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
  SYNTHETIC_START_WINDOW_DAYS,
} from '@codaco/protocol-validation';

import { DEFAULT_SYNTHETIC_SEED, MAX_SYNTHETIC_INTERVIEWS } from './constants';
import { createEntityConstraintCache } from './constraints/entityConstraintCache';
import { SyntheticDataConstraintError } from './constraints/error';
import {
  analyseFeasibility,
  FEASIBILITY_SUMMARY,
} from './constraints/feasibility';
import {
  reservePromptFixedValues,
  reserveRosterValues,
} from './constraints/reservations';
import { UniqueRegistry } from './constraints/uniqueRegistry';
import { ValueGenerator } from './constraints/ValueGenerator';
import { createSessionClock } from './session-engine/clock';
import { SessionEngine } from './session-engine/engine';
import {
  finaliseSession,
  type SyntheticInterviewResult,
} from './session-engine/envelope';
import {
  createSessionStreams,
  sessionValueSeed,
} from './session-engine/streams';
import { simulateAlterEdgeForm } from './simulators/AlterEdgeForm';
import { simulateAlterForm } from './simulators/AlterForm';
import { simulateCategoricalBin } from './simulators/CategoricalBin';
import { simulateContentStage } from './simulators/contentStages';
import { simulateDyadCensus } from './simulators/DyadCensus';
import { simulateEgoForm } from './simulators/EgoForm';
import { simulateFamilyPedigree } from './simulators/FamilyPedigree';
import { familyPedigreeOptionsSchema } from './simulators/familyPedigree/options';
import { simulateGeospatial } from './simulators/Geospatial';
import { simulateNameGenerator } from './simulators/NameGenerator';
import { simulateNameGeneratorQuickAdd } from './simulators/NameGeneratorQuickAdd';
import { simulateNameGeneratorRoster } from './simulators/NameGeneratorRoster';
import { simulateNetworkComposer } from './simulators/NetworkComposer';
import { simulateOneToManyDyadCensus } from './simulators/OneToManyDyadCensus';
import { simulateOrdinalBin } from './simulators/OrdinalBin';
import { simulateSociogram } from './simulators/Sociogram';
import { simulateTieStrengthCensus } from './simulators/TieStrengthCensus';
import type { AssetData, SimulatorRegistry } from './simulators/types';
import { invariant } from './utils/invariant';
import {
  createOverridesApplier,
  type OverridesApplier,
  refuseOverrideConflicts,
  reserveOverrideFixedValues,
  sessionOverridesSchema,
} from './walk/overrides';
import { walkSession } from './walk/walk';

export type { SyntheticSessionAction } from './session-engine/actions';
export type { SyntheticInterviewResult } from './session-engine/envelope';
export type {
  AssetData,
  SimulationContext,
  StageSimulator,
} from './simulators/types';
export type {
  EdgeOverrideEntry,
  NodeOverrideEntry,
  SessionOverrides,
} from './walk/overrides';

/**
 * The one simulator per interface type (spec rule 1). A type absent here
 * makes the walk throw a structured error — never a silent fallthrough. The
 * remaining interfaces register as Phase 3 lands them.
 */
export const REGISTRY: SimulatorRegistry = {
  AlterEdgeForm: simulateAlterEdgeForm,
  AlterForm: simulateAlterForm,
  Anonymisation: simulateContentStage,
  CategoricalBin: simulateCategoricalBin,
  DyadCensus: simulateDyadCensus,
  EgoForm: simulateEgoForm,
  FamilyPedigree: simulateFamilyPedigree,
  Geospatial: simulateGeospatial,
  Information: simulateContentStage,
  NameGenerator: simulateNameGenerator,
  NameGeneratorQuickAdd: simulateNameGeneratorQuickAdd,
  NameGeneratorRoster: simulateNameGeneratorRoster,
  Narrative: simulateContentStage,
  NarrativePedigree: simulateContentStage,
  NetworkComposer: simulateNetworkComposer,
  OneToManyDyadCensus: simulateOneToManyDyadCensus,
  OrdinalBin: simulateOrdinalBin,
  Sociogram: simulateSociogram,
  TieStrengthCensus: simulateTieStrengthCensus,
};

export const generateInterviewsOptions = z
  .object({
    count: z.number().int().min(1).max(MAX_SYNTHETIC_INTERVIEWS),
    seed: z.number().optional().default(DEFAULT_SYNTHETIC_SEED),
    simulateDropOut: z.boolean().default(true),
    respectSkipLogic: z.boolean().default(true),
    /**
     * Whether stage-level network filters narrow what each stage shows. Off,
     * every stage reads the unfiltered network — the second half of the
     * hosts' combined "respect skip logic and filtering" toggle, which trades
     * runtime-faithfulness for fuller test data. Panel filters always apply:
     * they select a panel's candidates, not what a stage displays.
     */
    respectFiltering: z.boolean().default(true),
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
     * Validated as a full ISO datetime: a zone-less string would be parsed in
     * the machine's local time, silently making output timezone-dependent.
     */
    startWindow: z.string().datetime().optional(),
    /**
     * Family-pedigree population and scenario options, applied to every
     * FamilyPedigree stage in the run. Run-level rather than protocol-embedded:
     * a family is a structure, not a population. Omitted, every field resolves
     * to the bundled reference profile, so existing callers are unaffected.
     */
    familyPedigree: familyPedigreeOptionsSchema.optional(),
    /** Capture the engine's write trace for parity testing. */
    captureTrace: z.boolean().default(false),
    /**
     * The fixture channel (spec: builder succession): per-stage predetermined
     * creation output, plus relationships applied once the walk ends. A stage
     * listed here is not simulated — the caller has already said what the
     * participant did there. See `walk/overrides.ts`.
     */
    overrides: sessionOverridesSchema.optional(),
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

  // A stop target the protocol does not have is a caller holding a stale
  // index: walking anyway would return a fully answered session where a
  // stopped preview was asked for, so it is refused where the mistake is.
  if (options.stopAt !== undefined) {
    const { stageIndex, promptIndex } = options.stopAt;
    const stage = protocol.stages[stageIndex];
    invariant(
      stage,
      `stopAt.stageIndex ${stageIndex} is out of range: this protocol has ${protocol.stages.length} stages`,
    );
    if (promptIndex !== undefined) {
      // A stage without prompts still accepts a bound of 1 — "worked the
      // stage" — because that is the reading every form simulator gives it.
      const promptCeiling = Math.max(
        1,
        'prompts' in stage ? stage.prompts.length : 1,
      );
      invariant(
        promptIndex <= promptCeiling,
        `stopAt.promptIndex ${promptIndex} is out of range: stage "${stage.id}" has ${promptCeiling === 1 && !('prompts' in stage) ? 'no prompts' : `${promptCeiling} prompts`}`,
      );
    }
  }

  // Walked once per batch: the answer is the same for every session.
  const interfaceRules = collectInterfaceImpliedRules(protocol);

  // One clock read per batch when the caller pins nothing, so a batch is
  // internally consistent; a pinned startWindow makes the run byte-stable.
  const startWindowAnchor = options.startWindow ?? new Date().toISOString();

  // Pre-seed refusal (rule 5): a protocol either always generates or never
  // generates, decided once per batch from the protocol, the options, and the
  // pools the caller resolved — never from a seed. The anchor's own day dates
  // the analysis — and every day of the start window behind it, because each
  // session's date-relative windows resolve against its OWN start day — so
  // the verdict moves with the batch rather than with a clock read of its
  // own. The walk's own bounds bound the analysis too: stages a stopAt run
  // never reaches, and stages the fixture channel replaces, demand nothing.
  const conflicts = analyseFeasibility({
    protocol,
    assetData,
    today: startWindowAnchor.slice(0, 10),
    interfaceRules,
    windowDays: SYNTHETIC_START_WINDOW_DAYS,
    ...(options.stopAt ? { stopAt: options.stopAt } : {}),
    ...(options.overrides ? { overrides: options.overrides } : {}),
  });
  if (conflicts.length > 0) {
    throw new SyntheticDataConstraintError(conflicts, FEASIBILITY_SUMMARY);
  }

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

    const today = clock.startTime.slice(0, 10);
    // Values are the one thing NOT drawn from the session's substreams: the
    // constraint machinery needs personas rather than uniform bits, so it
    // keeps its own faker, seeded from the same batch seed and this session's
    // position in it — through the ordered, domain-separated mix, so two
    // batches never meet on one session.
    const valueGen = new ValueGenerator(
      sessionValueSeed(options.seed, index),
      today,
    );
    const uniqueRegistry = new UniqueRegistry();
    const entityConstraints = createEntityConstraintCache({
      codebook: protocol.codebook,
      today,
      interfaceRules,
    });

    // Before the first stage runs, so a value a later prompt fixes — or one a
    // roster row is carrying — is out of the way of the draws that come
    // before it.
    const handles = { entityConstraints, uniqueRegistry };
    reservePromptFixedValues(handles, protocol.stages);
    reserveRosterValues(handles, protocol.stages, assetData);

    const context = {
      engine,
      streams,
      protocol,
      assetData,
      today,
      interfaceRules,
      respectFiltering: options.respectFiltering,
      valueGen,
      uniqueRegistry,
      entityConstraints,
      ...(options.familyPedigree
        ? { familyPedigree: options.familyPedigree }
        : {}),
    };

    // The fixture channel refuses contradictions before anything draws, and
    // its fixed values take the same pre-walk hold a prompt's do.
    let applier: OverridesApplier | undefined;
    if (options.overrides) {
      refuseOverrideConflicts(options.overrides, protocol.stages, context);
      reserveOverrideFixedValues(options.overrides, context);
      applier = createOverridesApplier(options.overrides, context);
    }

    const outcome = walkSession({
      stages: protocol.stages,
      registry: REGISTRY,
      context,
      clock,
      streams,
      respectSkipLogic: options.respectSkipLogic,
      simulateDropOut,
      stopAt: options.stopAt,
      overrides: applier,
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
