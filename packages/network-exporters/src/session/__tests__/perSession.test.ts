import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { SessionProcessingError } from '../../errors';
import { perSession } from '../perSession';

describe('perSession', () => {
  it('partitions successes from failures, tagging failures with stage and sessionId', async () => {
    const items = [{ id: 'ok-1' }, { id: 'bad' }, { id: 'ok-2' }];

    const fn = (item: { id: string }) =>
      item.id === 'bad'
        ? Effect.fail(new Error('nope'))
        : Effect.succeed(item.id.toUpperCase());

    const [errors, successes] = await Effect.runPromise(
      perSession('insertEgo', fn, (item: { id: string }) => item.id)(items),
    );

    expect(successes).toEqual(['OK-1', 'OK-2']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(SessionProcessingError);
    expect(errors[0]?.stage).toBe('insertEgo');
    expect(errors[0]?.sessionId).toBe('bad');
  });
});
