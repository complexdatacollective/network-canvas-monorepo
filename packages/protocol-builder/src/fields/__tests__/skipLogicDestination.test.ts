import { describe, expect, it } from 'vitest';

import { SkipLogicDestinationSchema } from '@codaco/protocol-validation';

import {
  asSkipLogicDestination,
  destinationRoute,
  EARLIER_DESTINATION_PROBLEM,
  MISSING_DESTINATION_PROBLEM,
  routeDestination,
  skipLogicDestinationOptions,
  skipLogicDestinationProblem,
  stagePlacement,
  UNREADABLE_DESTINATION_PROBLEM,
} from '../skipLogicDestination.ts';

const stages = [
  { id: 'stage-1', label: 'Welcome' },
  { id: 'stage-2', label: 'Middle' },
  { id: 'stage-3', label: '' },
];

const labels = (options: readonly { label: string }[]) =>
  options.map((option) => option.label);

describe('reading a stored destination', () => {
  it('reads the two shapes the schema allows', () => {
    expect(asSkipLogicDestination({ type: 'finish' })).toEqual({
      type: 'finish',
    });
    expect(
      asSkipLogicDestination({ type: 'stage', stageId: 'stage-2' }),
    ).toEqual({ type: 'stage', stageId: 'stage-2' });
  });

  it('reads anything else as no destination rather than throwing', () => {
    // Absence is how "continue at the next available stage" is spelled, and
    // every one of these arrives from a protocol someone else may have edited.
    for (const value of [
      undefined,
      null,
      'route:next',
      [],
      { type: 'stage' },
      { type: 'stage', stageId: '' },
      { type: 'somewhere-else' },
    ]) {
      expect(asSkipLogicDestination(value)).toBeUndefined();
    }
  });

  /**
   * The schema's own two shapes are `strictObject`s, so a key beside them is
   * a destination it refuses — however good the rest of the object looks.
   * Read as the shape it resembles, `{ type: 'finish', stageId: 'stale' }`
   * showed as "End the interview" with nothing wrong, while the stored value
   * kept the key that refused the save.
   */
  it('reads a destination carrying a key the schema refuses as no destination', () => {
    for (const value of [
      { type: 'finish', stageId: 'stale' },
      { type: 'stage', stageId: 'stage-2', action: 'SKIP' },
    ]) {
      // The premise, stated rather than assumed: these are values the protocol
      // schema itself rejects, which is what makes reading them as clean
      // destinations a save nothing in the editor can explain.
      expect(SkipLogicDestinationSchema.safeParse(value).success).toBe(false);
      expect(asSkipLogicDestination(value)).toBeUndefined();
    }
  });

  it('keeps reading the two shapes the schema accepts', () => {
    for (const value of [
      { type: 'finish' },
      { type: 'stage', stageId: 'stage-2' },
    ]) {
      expect(SkipLogicDestinationSchema.safeParse(value).success).toBe(true);
      expect(asSkipLogicDestination(value)).toEqual(value);
    }
  });

  it('round-trips a destination through the route the select speaks', () => {
    expect(routeDestination(destinationRoute({ type: 'finish' }))).toEqual({
      type: 'finish',
    });
    expect(
      routeDestination(destinationRoute({ type: 'stage', stageId: 's-9' })),
    ).toEqual({ type: 'stage', stageId: 's-9' });
    // The next available stage is the absence of a destination, both ways.
    expect(routeDestination(destinationRoute(undefined))).toBeUndefined();
  });
});

describe('where the stage sits', () => {
  it('finds an existing stage in the interview rather than being told', () => {
    expect(stagePlacement(stages, 'stage-2')).toEqual({
      index: 1,
      isNew: false,
    });
  });

  it('ignores a position given for a stage the interview already has', () => {
    expect(stagePlacement(stages, 'stage-2', 0)).toEqual({
      index: 1,
      isNew: false,
    });
  });

  it('puts a stage being created where the host says it will go', () => {
    expect(stagePlacement(stages, 'stage-new', 1)).toEqual({
      index: 1,
      isNew: true,
    });
  });

  it('treats a stage being created as arriving at the end by default', () => {
    expect(stagePlacement(stages, 'stage-new')).toEqual({
      index: 3,
      isNew: true,
    });
  });
});

describe('the destinations on offer', () => {
  it('offers only stages after this one, numbered as they are today', () => {
    expect(
      labels(skipLogicDestinationOptions(stages, { index: 0, isNew: false })),
    ).toEqual([
      'Next available stage',
      'Stage 2 — Middle',
      'Stage 3 — Untitled stage',
      'End the interview',
    ]);
  });

  it('numbers stages a new one is about to displace by where they will end up', () => {
    // Inserted at index 1, the stage currently second becomes the third.
    expect(
      labels(skipLogicDestinationOptions(stages, { index: 1, isNew: true })),
    ).toEqual([
      'Next available stage',
      'Stage 3 — Middle',
      'Stage 4 — Untitled stage',
      'End the interview',
    ]);
  });

  it('keeps a destination whose stage has been deleted on screen', () => {
    const options = skipLogicDestinationOptions(
      stages,
      { index: 0, isNew: false },
      { type: 'stage', stageId: 'deleted' },
    );

    // Left out, the select would fall back to its placeholder and read as
    // though nothing had ever been chosen.
    expect(options.at(-1)).toEqual({
      value: 'route:stage:deleted',
      label: 'A stage that is no longer in this interview',
      disabled: true,
    });
  });

  it('names a destination that has moved to before this stage', () => {
    const options = skipLogicDestinationOptions(
      stages,
      { index: 2, isNew: false },
      { type: 'stage', stageId: 'stage-1' },
    );

    expect(options.at(-1)).toEqual({
      value: 'route:stage:stage-1',
      label: 'Welcome (earlier in the interview)',
      disabled: true,
    });
  });
});

describe('what is wrong with a destination', () => {
  const placement = { index: 0, isNew: false };

  it('has nothing to say about the routes that always work', () => {
    expect(
      skipLogicDestinationProblem(undefined, stages, placement),
    ).toBeUndefined();
    expect(
      skipLogicDestinationProblem({ type: 'finish' }, stages, placement),
    ).toBeUndefined();
    expect(
      skipLogicDestinationProblem(
        { type: 'stage', stageId: 'stage-2' },
        stages,
        placement,
      ),
    ).toBeUndefined();
  });

  it('reports a stage that is no longer in the interview', () => {
    expect(
      skipLogicDestinationProblem(
        { type: 'stage', stageId: 'deleted' },
        stages,
        placement,
      ),
    ).toBe(MISSING_DESTINATION_PROBLEM);
  });

  it('reports a stage the interview now reaches before this one', () => {
    expect(
      skipLogicDestinationProblem(
        { type: 'stage', stageId: 'stage-1' },
        stages,
        { index: 2, isNew: false },
      ),
    ).toBe(EARLIER_DESTINATION_PROBLEM);
  });

  /**
   * Absence is how "continue at the next available stage" is spelled, so a
   * destination the schema cannot read has to be told apart from one that was
   * never there: the protocol schema refuses the first and accepts the second,
   * and reading them the same way leaves the researcher looking at a control
   * that says the interview continues at the next stage while the stage they
   * cannot see is what the save is refused for.
   */
  it('reports a destination it cannot read as a problem, not as no destination', () => {
    // Stated before the sweep so the sweep cannot pass by comparing one
    // absent verdict against another.
    expect(UNREADABLE_DESTINATION_PROBLEM).toEqual(expect.any(String));
    for (const value of [
      { type: 'stage' },
      { type: 'stage', stageId: '' },
      { type: 'somewhere-else' },
      // A valid discriminator carrying a key the schema's `strictObject`
      // refuses: the one shape that used to read as a finished answer.
      { type: 'finish', stageId: 'stale' },
      { type: 'stage', stageId: 'stage-2', action: 'SKIP' },
      'route:next',
      [],
      null,
    ]) {
      expect(skipLogicDestinationProblem(value, stages, placement)).toBe(
        UNREADABLE_DESTINATION_PROBLEM,
      );
    }
  });

  it('keeps saying nothing about a destination that is genuinely absent', () => {
    expect(
      skipLogicDestinationProblem(undefined, stages, placement),
    ).toBeUndefined();
  });
});

describe('a destination the control cannot read', () => {
  const placement = { index: 0, isNew: false };

  it('does not route to the next available stage', () => {
    // The route the select speaks is what decides which option reads as
    // chosen, so sharing the absent route is what made a malformed
    // destination show as "Next available stage".
    expect(destinationRoute({ type: 'stage' })).not.toBe(
      destinationRoute(undefined),
    );
  });

  it('is shown as an option of its own rather than falling back', () => {
    const options = skipLogicDestinationOptions(stages, placement, {
      type: 'stage',
    });

    expect(options.at(-1)).toEqual({
      value: destinationRoute({ type: 'stage' }),
      label: 'A destination this editor cannot read',
      disabled: true,
    });
  });
});
