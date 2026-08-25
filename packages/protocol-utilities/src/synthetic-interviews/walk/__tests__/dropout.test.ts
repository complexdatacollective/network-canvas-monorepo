import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CurrentProtocolSchema,
  DEFAULT_RESPONSE_BURDEN,
  DROPOUT_HAZARD_RATE,
  type StageType,
} from '@codaco/protocol-validation';

import {
  createSessionStreams,
  type SessionStreams,
} from '../../session-engine/streams';
import { determineDropout } from '../dropout';

// Every assertion below runs against a seeded stream, so each observed rate is
// a fixed number rather than a fresh sample — these tests do not flake. The
// tolerances exist to survive a change of random generator, not to paper over
// run-to-run variance.
const TEST_SEED = 1234;

// determineDropout reads nothing but each stage's own `responseBurden`, so a
// test need supply no more of a stage than that. Built from the schema's
// per-type table rather than from literals, because that is what parsing an
// undeclared stage puts on it — a test that hardcoded 1.0 for a DyadCensus
// would keep passing after the table it is describing had moved.
type CompletedStage = { synthetic: { responseBurden: number } };

const completed = (type: StageType): CompletedStage => ({
  synthetic: { responseBurden: DEFAULT_RESPONSE_BURDEN[type] },
});

const repeat = (type: StageType, count: number): CompletedStage[] =>
  Array.from({ length: count }, () => completed(type));

const streamsFor = (seed = TEST_SEED): SessionStreams =>
  createSessionStreams(seed, 0);

/** The fraction of `trials` rolls that end the interview, for one history. */
const observedDropoutRate = (
  completedStages: CompletedStage[],
  trials: number,
  streams: SessionStreams = streamsFor(),
): number => {
  let dropouts = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    if (determineDropout(completedStages, streams)) {
      dropouts += 1;
    }
  }
  return dropouts / trials;
};

// The sample protocol itself — the burden profile DROPOUT_HAZARD_RATE is
// calibrated against — parsed through the schema exactly as a host would, so
// every stage carries the burden parsing resolved for it. Read by relative
// path following `schemaOwnsParameters.test.ts`: packages/protocols is pure
// data with no test runner of its own.
const SAMPLE_PROTOCOL_BURDENS: CompletedStage[] = (
  CurrentProtocolSchema.parse(
    JSON.parse(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          '../../../../../protocols/sample/protocol.json',
        ),
        'utf8',
      ),
    ),
  ).stages as unknown as CompletedStage[]
).map((stage) => ({
  synthetic: { responseBurden: stage.synthetic.responseBurden },
}));

describe('determineDropout', () => {
  it('never ends a session before any stage has been completed', () => {
    // No stages completed is no burden accumulated, so the hazard is exactly
    // zero — a participant cannot abandon an interview they have not started.
    expect(observedDropoutRate([], 1000)).toBe(0);
  });

  it('never ends a session made up of stages that carry no burden', () => {
    // Information and Narrative are read-only screens: they lengthen an
    // interview without asking anything of the participant, so however many of
    // them accumulate, the hazard stays at zero.
    const scriptedScreens = [
      ...repeat('Information', 50),
      ...repeat('Narrative', 50),
    ];

    expect(observedDropoutRate(scriptedScreens, 1000)).toBe(0);
  });

  it('ends sessions at the rate the declared hazard predicts', () => {
    // The model is `1 - exp(-rate * burden)`. Read against DROPOUT_HAZARD_RATE
    // rather than a hardcoded probability, so recalibrating the constant does
    // not invalidate the shape this asserts.
    const completedStages = repeat('DyadCensus', 200); // 1.0 burden each.
    const expected = 1 - Math.exp(-DROPOUT_HAZARD_RATE * 200);

    // 100 000 rolls, because the assertion's tolerance (±0.005) is tighter
    // than the sampling error of 20 000 would be: at p ≈ 0.2 that is a
    // standard error of 0.0028, so a perfectly correct sampler fails on some
    // seeds. Seeded, so this is one fixed figure rather than a fresh sample.
    expect(observedDropoutRate(completedStages, 100_000)).toBeCloseTo(
      expected,
      2,
    );
  });

  it('grows more likely as burden accumulates', () => {
    const early = observedDropoutRate(repeat('DyadCensus', 50), 20_000);
    const middle = observedDropoutRate(repeat('DyadCensus', 200), 20_000);
    const late = observedDropoutRate(repeat('DyadCensus', 800), 20_000);

    expect(early).toBeLessThan(middle);
    expect(middle).toBeLessThan(late);
  });

  it('weighs a demanding stage more heavily than a light one', () => {
    // Same number of stages completed either way; only the burden each stage
    // type carries differs (DyadCensus 1.0 against NameGeneratorQuickAdd 0.2).
    const demanding = observedDropoutRate(repeat('DyadCensus', 200), 20_000);
    const light = observedDropoutRate(
      repeat('NameGeneratorQuickAdd', 200),
      20_000,
    );

    expect(light).toBeLessThan(demanding);
  });

  it('reads the burden off the stage rather than off its type', () => {
    // The whole point of moving burden into the protocol: an author who says
    // their DyadCensus is a light one gets a light one. Read against the
    // burden a DyadCensus carries by default, so this fails if the lookup by
    // type ever comes back.
    const authored = (responseBurden: number): CompletedStage[] =>
      Array.from({ length: 200 }, () => ({ synthetic: { responseBurden } }));

    const byDefault = observedDropoutRate(repeat('DyadCensus', 200), 20_000);
    const lightened = observedDropoutRate(
      authored(DEFAULT_RESPONSE_BURDEN.DyadCensus / 5),
      20_000,
    );
    const heavier = observedDropoutRate(
      authored(DEFAULT_RESPONSE_BURDEN.DyadCensus * 2),
      20_000,
    );

    expect(lightened).toBeLessThan(byDefault);
    expect(byDefault).toBeLessThan(heavier);
  });

  it('never ends a session made up of stages an author priced at zero', () => {
    // A researcher-operated stage costs the participant nothing, whatever its
    // type would otherwise have cost — so no number of them can end a session.
    const free = Array.from({ length: 200 }, () => ({
      synthetic: { responseBurden: 0 },
    }));

    expect(observedDropoutRate(free, 1000)).toBe(0);
  });

  it('reproduces the same decisions for the same seed', () => {
    const rollSequence = (seed: number): boolean[] => {
      const streams = streamsFor(seed);
      const completedStages = repeat('DyadCensus', 300);
      return Array.from({ length: 200 }, () =>
        determineDropout(completedStages, streams),
      );
    };

    const sequence = rollSequence(TEST_SEED);

    // Both outcomes occur, so the equality below is a real reproduction rather
    // than two runs of a function that always answers the same way.
    expect(sequence).toContain(true);
    expect(sequence).toContain(false);

    expect(rollSequence(TEST_SEED)).toEqual(sequence);
    expect(rollSequence(TEST_SEED + 1)).not.toEqual(sequence);
  });

  it('rolls its die on the dropout substream alone', () => {
    // Adding a draw anywhere else in the walk must not move where a session
    // ends — the property the substream split exists to give.
    const completedStages = repeat('DyadCensus', 300);

    const plain = streamsFor();
    const undisturbed = Array.from({ length: 200 }, () =>
      determineDropout(completedStages, plain),
    );

    const disturbed = streamsFor();
    const rolled = Array.from({ length: 200 }, () => {
      disturbed.draw('counts');
      disturbed.draw('coins');
      disturbed.normal('clock');
      return determineDropout(completedStages, disturbed);
    });

    expect(rolled).toEqual(undisturbed);
  });

  it('matches the closed form within 1.5 points over 50k sample walks (C8)', () => {
    // The docblock on DROPOUT_HAZARD_RATE derives the completion probability
    // as exp(-rate * S), S being the sum of the cumulative burden at each
    // stage. This measures the same quantity by simulation over the REAL
    // parsed sample protocol — 50,000 seeded roll SEQUENCES, dice-level
    // rather than full walks: the simulators never run, which is what makes
    // fifty thousand of these affordable. The walk-level path (route, resume
    // position, truncated state) is exercised by the parity suite's
    // dropped-session legs instead. Held within one and a half percentage
    // points: a drift in the schema's burden table, the sample protocol, or
    // the roll itself moves the measured rate away from the closed form and
    // fails here.
    let S = 0;
    let cumulative = 0;
    for (const stage of SAMPLE_PROTOCOL_BURDENS) {
      cumulative += stage.synthetic.responseBurden;
      S += cumulative;
    }
    const closedForm = 1 - Math.exp(-DROPOUT_HAZARD_RATE * S);

    // The calibration target the docblock states: roughly one in ten.
    expect(closedForm).toBeGreaterThan(0.08);
    expect(closedForm).toBeLessThan(0.12);

    const interviews = 50000;
    let abandoned = 0;
    for (let interview = 0; interview < interviews; interview += 1) {
      const streams = createSessionStreams(TEST_SEED, interview);
      const completedStages: CompletedStage[] = [];
      for (const stage of SAMPLE_PROTOCOL_BURDENS) {
        completedStages.push(stage);
        if (determineDropout(completedStages, streams)) {
          abandoned += 1;
          break;
        }
      }
    }

    const measured = abandoned / interviews;
    expect(Math.abs(measured - closedForm)).toBeLessThan(0.015);
  });
});
