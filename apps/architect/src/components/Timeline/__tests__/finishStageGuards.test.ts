import { describe, expect, it } from 'vitest';

import { messageFields } from '~/test/messageText';

import {
  getFinishStageDeleteWarning,
  getFinishStageReorderWarning,
} from '../finishStageGuards';

const intro = { id: 'intro', type: 'Information' as const };
const names = { id: 'names', type: 'NameGenerator' as const };
const finish = { id: 'finish', type: 'FinishSession' as const };
const stages = [intro, names, finish];

describe('Timeline finish stage guards', () => {
  it('explains why the only finish stage cannot be deleted', () => {
    expect(
      messageFields(getFinishStageDeleteWarning(stages, 'finish')),
    ).toEqual({
      title: 'Cannot delete stage',
      description:
        'This stage ends the interview, and every protocol needs one, so it cannot be deleted. You can change its text and outcome instead.',
    });
  });

  it('lets any other stage, or one of two finish stages, be deleted', () => {
    expect(getFinishStageDeleteWarning(stages, 'names')).toBeNull();
    expect(
      getFinishStageDeleteWarning(
        [...stages, { ...finish, id: 'finish-2' }],
        'finish',
      ),
    ).toBeNull();
  });

  it('refuses an order that moves the finish stage off the end, or a stage after it', () => {
    const refusal = {
      title: 'Cannot move stage',
      description:
        'The stage that ends the interview has to stay at the end of the protocol. No participant could reach a stage placed after it.',
    };
    expect(
      messageFields(
        getFinishStageReorderWarning(stages, [intro, finish, names]),
      ),
    ).toEqual(refusal);
    expect(
      messageFields(
        getFinishStageReorderWarning(stages, [finish, intro, names]),
      ),
    ).toEqual(refusal);
  });

  it('accepts reordering the stages before the finish stage', () => {
    expect(
      getFinishStageReorderWarning(stages, [names, intro, finish]),
    ).toBeNull();
  });

  it('accepts an order that leaves an imported protocol no worse than it was', () => {
    const imported = [intro, finish, names];
    expect(
      getFinishStageReorderWarning(imported, [intro, names, finish]),
    ).toBeNull();
  });
});
