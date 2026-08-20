import type { Stage } from '@codaco/protocol-validation';

import type { SessionClock } from '../session-engine/clock';
import type { SessionStreams } from '../session-engine/streams';
import type {
  SimulationContext,
  SimulatorRegistry,
  StageSimulator,
} from '../simulators/types';
import { invariant } from '../utils/invariant';
import { determineDropout } from './dropout';
import { nextStageIndex } from './route';

/**
 * A stage's burden, read off the parsed protocol. Structural rather than
 * typed off the union because the per-type descriptor shapes differ; the
 * invariant is the engine's parsed-protocol contract surfacing early.
 */
const burdenOf = (stage: Stage): number => {
  const synthetic = (stage as { synthetic?: { responseBurden?: number } })
    .synthetic;
  invariant(
    typeof synthetic?.responseBurden === 'number',
    `stage "${stage.id}" declares no synthetic parameters — parse the protocol through the schema before generating`,
  );
  return synthetic.responseBurden;
};

export type WalkOutcome = {
  /** The resume position: next unreached stage, or stages.length when done. */
  currentStep: number;
  droppedOut: boolean;
  /** Whether the walk ran to the end of the route (stopAt runs never do). */
  finished: boolean;
};

/**
 * One participant working linearly through the protocol (spec rule 1: this
 * walk is the only model of stage behaviour). Per visited stage: resolve the
 * route against the network as it now stands, advance the clock through the
 * stage's burden (writes are stamped with the moment the participant finished
 * working), dispatch the one simulator for its type, then roll the dropout
 * die against cumulative burden — after every completed stage, including the
 * last (decision 19).
 */
export const walkSession = ({
  stages,
  registry,
  context,
  clock,
  streams,
  respectSkipLogic,
  simulateDropOut,
  stopAt,
}: {
  stages: readonly Stage[];
  registry: SimulatorRegistry;
  context: SimulationContext;
  clock: SessionClock;
  streams: SessionStreams;
  respectSkipLogic: boolean;
  simulateDropOut: boolean;
  stopAt?: { stageIndex: number; promptIndex?: number };
}): WalkOutcome => {
  const { engine } = context;
  const completedStages: Stage[] = [];

  let index = nextStageIndex(
    stages,
    engine.draft.network,
    -1,
    respectSkipLogic,
  );

  while (index !== undefined) {
    const stage = stages[index];
    invariant(stage, `no stage at step ${index}`);

    const atStopStage = stopAt !== undefined && index >= stopAt.stageIndex;
    const promptBound = atStopStage ? (stopAt.promptIndex ?? 0) : undefined;

    // The participant spends the stage's time before their answers land, so
    // every write the simulator makes carries the stage-end instant. A
    // stop-at stage is left mid-flight: no time is charged for prompts that
    // never ran — coarse, but a preview's timestamps are never read.
    if (!atStopStage) clock.advanceThroughStage(burdenOf(stage));

    const simulate = registry[stage.type] as StageSimulator | undefined;
    invariant(
      simulate,
      `no simulator for stage type "${stage.type}" — a stage the walk cannot ` +
        'express must fail loudly rather than fall through as a second model ' +
        'of stage behaviour',
    );
    simulate(stage, context, promptBound);

    if (atStopStage) {
      // Arrived and (partially) worked, never left: no transition, no
      // dropout, resume position is this stage.
      return { currentStep: index, droppedOut: false, finished: false };
    }

    completedStages.push(stage);

    if (simulateDropOut && determineDropout(completedStages, streams)) {
      // Abandoned after finishing this stage: the exit transition never
      // fires (the participant closed the app, not the stage), and the
      // resume position is wherever the route now leads.
      const resume = nextStageIndex(
        stages,
        engine.draft.network,
        index,
        respectSkipLogic,
      );
      return {
        currentStep: resume ?? stages.length,
        droppedOut: true,
        finished: false,
      };
    }

    // Leaving the stage: the runtime dispatches transitionStage on every
    // completed exit, resetting promptIndex for the next stage.
    engine.transitionStage();

    index = nextStageIndex(
      stages,
      engine.draft.network,
      index,
      respectSkipLogic,
    );
  }

  return { currentStep: stages.length, droppedOut: false, finished: true };
};
