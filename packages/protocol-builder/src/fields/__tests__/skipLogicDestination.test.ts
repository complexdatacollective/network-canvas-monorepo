import { describe, expect, it } from 'vitest';

import {
  asSkipLogicDestination,
  destinationRoute,
  EARLIER_DESTINATION_PROBLEM,
  MISSING_DESTINATION_PROBLEM,
  routeDestination,
  skipLogicDestinationOptions,
  skipLogicDestinationProblem,
  stagePlacement,
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
});
