import { z } from 'zod';

import {
  collectInterfaceImpliedRules,
  type CurrentProtocol,
  type InterfaceImpliedRules,
  SYNTHETIC_START_WINDOW_DAYS,
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

/**
 * What a caller may anchor a batch — or a standalone reading of the gate — to.
 *
 * One rule for both, because the gate advertises itself as the question the
 * run will ask: a preflight that accepted an anchor generation refuses would
 * hand back a verdict about a run that cannot happen, and one that accepted a
 * date-only string would date the analysis from characters that are not a
 * date at all.
 *
 * A full ISO datetime, because a zone-less string is parsed in the machine's
 * local time — silently making output timezone-dependent.
 */
const startWindowSchema = z.string().datetime();

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
    startWindow: startWindowSchema.optional(),
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
   *
   * Held to the run's own rule ({@link startWindowSchema}), and refused the
   * same way: a value generation would not accept must not come back from here
   * as a verdict about a run that could never start.
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
    // The same start-window breadth generation measures over, so a host's
    // standalone verdict and the gate's are the same verdict.
    windowDays: SYNTHETIC_START_WINDOW_DAYS,
  });

export const analyseSyntheticFeasibility = (
  protocol: CurrentProtocol,
  assetData: AssetData = {},
  options: AnalyseSyntheticFeasibilityOptions = {},
): ConstraintConflict[] => {
  assertStagesCarrySyntheticDescriptors(protocol);
  // Parsed before it is sliced: the first ten characters of an arbitrary
  // string are not a date, and a verdict dated from them would be a confident
  // answer about a run `generateInterviews` would refuse to start.
  const anchor = startWindowSchema.optional().parse(options.startWindow);
  return analyseFeasibilityWithRules(
    protocol,
    assetData,
    anchor ?? new Date().toISOString(),
    collectInterfaceImpliedRules(protocol),
  );
};

/**
 * A batch with everything decided except the drawing: the parsed options, and
 * the one function that turns an index into a session.
 *
 * Held apart from the loop because there are two loops — one that runs the
 * batch straight through and one that hands the thread back between sessions
 * — and every decision above them (the refusal, the interface rules, the
 * anchor a whole batch dates from) has to be made exactly once and identically
 * for both. A session is a pure function of its index and this preparation, so
 * the two drivers cannot draw different interviews.
 */
type PreparedBatch = {
  options: z.output<typeof generateInterviewsOptions>;
  generateOne: (
    index: number,
    simulateDropOut: boolean,
  ) => SyntheticInterviewResult;
};

const prepareBatch = (
  protocol: CurrentProtocol,
  userOptions: GenerateInterviewsOptions,
  assetData: AssetData,
): PreparedBatch => {
  const options = generateInterviewsOptions.parse(userOptions);

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
  // pools the caller resolved — never from a seed. The anchor's own day dates
  // the analysis — and every day of the start window behind it, because each
  // session's date-relative windows resolve against its OWN start day — so
  // the verdict moves with the batch rather than with a clock read of its
  // own. The walk's own bounds bound the analysis too: stages a stopAt run
  // never reaches, and stages the fixture channel replaces, demand nothing.
  // Runs over the very rules the walk below reads, so this gate and the one
  // a host runs standalone are the same gate by construction.
  const conflicts = analyseFeasibility({
    protocol,
    assetData,
    // The anchor's own day dates the analysis (date windows measure against
    // it), so the verdict is a function of the arguments and nothing else.
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

  return { options, generateOne };
};

/**
 * The sessions the completed floor has to redraw (decision 20): a deficit
 * session re-runs on its OWN substreams with dropout disabled — the same
 * participant finishing — so the floor stays deterministic and sessions
 * outside the deficit are untouched.
 *
 * Returned as indices rather than performed here, so the driver that yields
 * between draws can yield between these too: the repair pass is drawing whole
 * sessions, and is exactly as long as the run that produced the deficit.
 */
const completionDeficit = (
  { options }: PreparedBatch,
  results: readonly SyntheticInterviewResult[],
): number[] => {
  if (!options.simulateDropOut || options.minimumCompletedRatio <= 0) return [];
  const minimumCompleted = Math.max(
    1,
    Math.ceil(options.count * options.minimumCompletedRatio),
  );
  let completed = results.filter((result) => !result.droppedOut).length;
  const deficit: number[] = [];
  for (
    let index = 0;
    index < options.count && completed < minimumCompleted;
    index += 1
  ) {
    if (!results[index]?.droppedOut) continue;
    deficit.push(index);
    completed += 1;
  }
  return deficit;
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
 *
 * Draws the whole batch without pausing, which is right for a caller that owns
 * its thread — a server route, a test, a one-session preview. A caller sharing
 * a thread with a user interface wants {@link generateInterviewsAsync}, which
 * draws the same batch and lets the thread breathe between sessions.
 */
/**
 * How a batch reports itself, given that it may still repair itself afterwards.
 *
 * The completed floor redraws WHOLE sessions once the walk is over — up to
 * `minimumCompletedRatio` of the batch, which on a demanding protocol is
 * seconds of work — and every one of them has already been counted once by
 * the loop that drew it. Reporting the last interview before that pass left
 * every host's bar sitting at the end while the work carried on.
 *
 * So where a repair is possible the final tick WAITS, and the total stays
 * `count`: a host renders "interview 999 of 1000" through the repairs and
 * reaches the end when the batch really has. A run that cannot repair itself
 * — no dropout, or no floor — reports exactly as it always did.
 */
const batchProgress = (
  options: PreparedBatch['options'],
  onProgress?: (done: number, total: number) => void,
) => {
  const mayRepair =
    options.simulateDropOut && options.minimumCompletedRatio > 0;
  return {
    drew: (done: number) =>
      onProgress?.(
        mayRepair ? Math.min(done, options.count - 1) : done,
        options.count,
      ),
    finished: () => {
      if (mayRepair) onProgress?.(options.count, options.count);
    },
  };
};

export const generateInterviews = (
  protocol: CurrentProtocol,
  userOptions: GenerateInterviewsOptions,
  assetData: AssetData = {},
  onProgress?: (done: number, total: number) => void,
): SyntheticInterviewResult[] => {
  const batch = prepareBatch(protocol, userOptions, assetData);
  const { options, generateOne } = batch;
  const progress = batchProgress(options, onProgress);

  const results: SyntheticInterviewResult[] = [];
  for (let index = 0; index < options.count; index += 1) {
    results.push(generateOne(index, options.simulateDropOut));
    progress.drew(index + 1);
  }

  for (const index of completionDeficit(batch, results)) {
    results[index] = generateOne(index, false);
  }
  progress.finished();

  return results;
};

/**
 * How long a batch may hold the thread before handing it back, in
 * milliseconds. One frame: long enough that a protocol whose sessions cost
 * almost nothing is not paying a scheduler round-trip for each of them, short
 * enough that a browser gets its next paint on time.
 */
const YIELD_SLICE_MS = 16;

/** Hand the thread back, far enough for a browser to paint on the way. */
const macrotask = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export type AsyncBatchOptions = {
  /**
   * How the thread is handed back. A macrotask by default, which is what lets
   * a browser render between sessions; a host with a better scheduler of its
   * own can supply it.
   */
  yieldControl?: () => Promise<void>;
  /**
   * Work to accumulate before handing the thread back, in milliseconds. Zero
   * yields after every session.
   */
  sliceMs?: number;
  /**
   * Stop drawing.
   *
   * Checked between sessions, where the batch is already pausing, and honoured
   * by throwing the signal's own reason. A host whose surface has gone — a
   * dialog closed, a page navigated away from — otherwise keeps a whole
   * batch's worth of work running for a result nobody will ever read.
   */
  signal?: AbortSignal;
};

/**
 * {@link generateInterviews}, run so that the thread it is on stays usable.
 *
 * Same batch, session for session and byte for byte: the two drivers share one
 * {@link prepareBatch}, and a session is a pure function of its index and that
 * preparation, so nothing about the pauses can reach the interviews. What the
 * pauses reach is everything else — a progress bar that actually moves, a
 * dialog that can still be read, a tab the browser does not offer to kill.
 *
 * Drawing a session costs real work (tens of milliseconds on a protocol with
 * many stages), and a batch may ask for {@link MAX_SYNTHETIC_INTERVIEWS} of
 * them, so a host that draws them all in one synchronous call freezes for as
 * long as that takes — during which its own `onProgress` renders nothing,
 * because it never gets a frame to render in.
 */
export const generateInterviewsAsync = async (
  protocol: CurrentProtocol,
  userOptions: GenerateInterviewsOptions,
  assetData: AssetData = {},
  onProgress?: (done: number, total: number) => void,
  {
    yieldControl = macrotask,
    sliceMs = YIELD_SLICE_MS,
    signal,
  }: AsyncBatchOptions = {},
): Promise<SyntheticInterviewResult[]> => {
  const batch = prepareBatch(protocol, userOptions, assetData);
  const { options, generateOne } = batch;
  const progress = batchProgress(options, onProgress);

  let held = Date.now();
  const breathe = async () => {
    // Between sessions is the one place a batch can be stopped: a session is
    // drawn in a single synchronous piece, so there is nothing to interrupt
    // inside one. Checked on every pass rather than only where the thread is
    // actually handed back, so a cheap protocol stops as promptly as a costly
    // one.
    signal?.throwIfAborted();
    if (Date.now() - held < sliceMs) return;
    await yieldControl();
    held = Date.now();
  };

  const results: SyntheticInterviewResult[] = [];
  for (let index = 0; index < options.count; index += 1) {
    results.push(generateOne(index, options.simulateDropOut));
    progress.drew(index + 1);
    await breathe();
  }

  for (const index of completionDeficit(batch, results)) {
    results[index] = generateOne(index, false);
    await breathe();
  }
  progress.finished();

  return results;
};
