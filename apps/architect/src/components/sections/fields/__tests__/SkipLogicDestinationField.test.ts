import { describe, expect, it } from 'vitest';

import {
  buildSkipLogicDestinationOptions,
  formatSkipLogicDestination,
  parseSkipLogicDestination,
} from '../SkipLogicDestinationField';

const stages = [
  { id: 'intro', label: 'Introduction' },
  { id: 'consent', label: 'Consent' },
  { id: 'questions', label: 'Repeated label' },
  { id: 'debrief', label: 'Repeated label' },
  { id: 'untitled', label: '' },
];

describe('skip logic destination value mapping', () => {
  it('formats protocol destinations as UI-only route values', () => {
    expect(formatSkipLogicDestination(undefined)).toBe('route:next');
    expect(formatSkipLogicDestination({ type: 'finish' })).toBe('route:finish');
    expect(
      formatSkipLogicDestination({ type: 'stage', stageId: 'debrief' }),
    ).toBe('route:stage:debrief');
  });

  it('parses UI-only route values into protocol destinations', () => {
    expect(parseSkipLogicDestination('route:next')).toBeUndefined();
    expect(parseSkipLogicDestination('route:finish')).toEqual({
      type: 'finish',
    });
    expect(parseSkipLogicDestination('route:stage:debrief')).toEqual({
      type: 'stage',
      stageId: 'debrief',
    });
  });

  it('preserves stage ids containing the route separator', () => {
    expect(parseSkipLogicDestination('route:stage:group:debrief')).toEqual({
      type: 'stage',
      stageId: 'group:debrief',
    });
  });

  it('does not persist malformed UI route values', () => {
    expect(parseSkipLogicDestination('route:stage:')).toBeUndefined();
    expect(parseSkipLogicDestination('unexpected')).toBeUndefined();
  });
});

describe('buildSkipLogicDestinationOptions', () => {
  it('offers only later stages for an existing stage and disambiguates duplicate labels by number', () => {
    expect(buildSkipLogicDestinationOptions(stages, 1, false)).toEqual([
      { value: 'route:next', label: 'Next available stage' },
      {
        value: 'route:stage:questions',
        label: 'Stage 3 — Repeated label',
      },
      {
        value: 'route:stage:debrief',
        label: 'Stage 4 — Repeated label',
      },
      {
        value: 'route:stage:untitled',
        label: 'Stage 5 — Untitled stage',
      },
      { value: 'route:finish', label: 'End the interview' },
    ]);
  });

  it('uses prospective numbering when inserting a new stage', () => {
    expect(buildSkipLogicDestinationOptions(stages, 1, true)).toEqual([
      { value: 'route:next', label: 'Next available stage' },
      { value: 'route:stage:consent', label: 'Stage 3 — Consent' },
      {
        value: 'route:stage:questions',
        label: 'Stage 4 — Repeated label',
      },
      {
        value: 'route:stage:debrief',
        label: 'Stage 5 — Repeated label',
      },
      {
        value: 'route:stage:untitled',
        label: 'Stage 6 — Untitled stage',
      },
      { value: 'route:finish', label: 'End the interview' },
    ]);
  });

  it('offers only the defaults when appending a new final stage', () => {
    expect(
      buildSkipLogicDestinationOptions(stages, stages.length, true),
    ).toEqual([
      { value: 'route:next', label: 'Next available stage' },
      { value: 'route:finish', label: 'End the interview' },
    ]);
  });
});
