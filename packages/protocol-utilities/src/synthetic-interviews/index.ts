import { z } from 'zod';

import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
  type InterfaceImpliedRules,
} from '@codaco/protocol-validation';

import { DEFAULT_SYNTHETIC_SEED, MAX_SYNTHETIC_INTERVIEWS } from './constants';
import { createEntityConstraintCache } from './constraints/entityConstraintCache';
import {
  type ConstraintConflict,
  SyntheticDataConstraintError,
} from './constraints/error';
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
import { createSessionStreams } from './session-engine/streams';
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
 * `protocol` must be schema-parse output. Stage-level `synthetic` descriptors
 * exist because parsing put them there, and both the walk and the feasibility
 * analysis read them; a document that skipped the schema is refused rather
 * than re-defaulted, because a default supplied here would be a second opinion
 * about what the schema resolves (spec rule 2).
 */
const assertStagesCarrySyntheticDescriptors = (protocol: CurrentProtocol) => {
  protocol.stages.forEach((stage) => {
    invariant(
      (stage as { synthetic?: unknown }).synthetic !== undefined,
      `stage "${stage.id}" declares no synthetic parameters — default parameters are supplied by parsing the protocol through the schema`,
    );
  });
};

export type AnalyseSyntheticFeasibilityOptions = {
  /**
   * ISO instant anchoring the analysis date, the same field a
   * `generateInterviews` run is anchored by — pass the run's own value to ask
   * exactly the question that run will ask. Defaults to a clock read, which is
   * what an unanchored generation run does too.
   */
  startWindow?: string;
};

/**
 * The pre-seed feasibility gate (spec rule 5), asked on its own: every reason
 * this protocol can never generate, as the structured conflicts generation
 * itself refuses with, or an empty list when it always generates. Nothing is
 * drawn and no session is produced.
 *
 * This IS the gate rather than a copy of it — `generateInterviews` calls this
 * same function and throws a `SyntheticDataConstraintError` over a non-empty
 * result — so a caller rendering these conflicts (Architect's live feasibility
 * surface) can never disagree with what a generation run would refuse.
 *
 * `protocol` must be schema-parse output, exactly as `generateInterviews`
 * requires; `assetData` carries the same host-resolved roster and Geospatial
 * pools, under the same three-way key contract (rows present = draw from
 * them, empty array = source known empty, key absent = source unresolved).
 */
/**
 * The gate itself, over rules the caller has already collected.
 *
 * `collectInterfaceImpliedRules` walks every stage of the protocol, and the
 * WALK needs the same rules the gate does — so a generation run that asked
 * through the public entry point below walked the protocol twice for one
 * answer. Threading them through is what makes the two the same walk; the
 * public signature is unchanged, and callers who have no rules in hand still
 * get them collected for them.
 */
const analyseFeasibilityWithRules = (
  protocol: CurrentProtocol,
  assetData: AssetData,
  anchor: string,
  interfaceRules: InterfaceImpliedRules,
): ConstraintConflict[] =>
  analyseFeasibility({
    protocol,
    assetData,
    // The anchor's own day dates the analysis (date windows measure against
    // it), so the verdict is a function of the arguments and nothing else.
    today: anchor.slice(0, 10),
    interfaceRules,
  });

export const analyseSyntheticFeasibility = (
  protocol: CurrentProtocol,
  assetData: AssetData = {},
  options: AnalyseSyntheticFeasibilityOptions = {},
): ConstraintConflict[] => {
  assertStagesCarrySyntheticDescriptors(protocol);
  return analyseFeasibilityWithRules(
    protocol,
    assetData,
    options.startWindow ?? new Date().toISOString(),
    collectInterfaceImpliedRules(protocol),
  );
};

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

  // One clock read per batch when the caller pins nothing, so a batch is
  // internally consistent; a pinned startWindow makes the run byte-stable.
  const startWindowAnchor = options.startWindow ?? new Date().toISOString();

  // The same refusal the public analysis opens with, and for the same reason:
  // a protocol that skipped the schema carries no descriptors to read.
  assertStagesCarrySyntheticDescriptors(protocol);

  // Walked once per batch, and once per batch ONLY: the answer is the same for
  // every session, and the same for the gate below as for the walk that
  // follows it.
  const interfaceRules = collectInterfaceImpliedRules(protocol);

  // Pre-seed refusal (rule 5): a protocol either always generates or never
  // generates, decided once per batch from the protocol, the options, and the
  // pools the caller resolved — never from a seed. The very analysis the
  // public entry point runs, over the very rules this walk will read, so this
  // gate and the one a host runs standalone are the same gate by
  // construction.
  const conflicts = analyseFeasibilityWithRules(
    protocol,
    assetData,
    startWindowAnchor,
    interfaceRules,
  );
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
    // position in it.
    const valueGen = new ValueGenerator(options.seed + index, today);
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

    // Predetermined relationships land once every stage that could have
    // materialised their endpoints has had its chance.
    applier?.applyEdges(outcome.visitedStages.at(-1) ?? 0);

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
