import { describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import type { InterviewPayload } from '../../contract/types';
import { updateEgo } from '../modules/session';
import { store as createStore } from '../store';

const patch = { set: { agrees: true }, unset: [] };

function makeInterview() {
  const payload: InterviewPayload = {
    session: {
      id: 'session-1',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: null,
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      network: {
        nodes: [],
        edges: [],
        ego: { _uid: 'ego-1', [entityAttributesProperty]: {} },
      },
    },
    protocol: {
      id: 'protocol-1',
      hash: 'hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Protocol',
      schemaVersion: 8,
      assets: [],
      codebook: {
        ego: { variables: { agrees: { name: 'Agrees', type: 'boolean' } } },
      },
      stages: [],
    },
  };
  const onSync = vi.fn(() => Promise.resolve());
  return { interview: createStore(payload, { onSync }), onSync };
}

// Whether `promise` has settled once everything already queued has run.
async function hasSettled(promise: Promise<void>) {
  let settled = false;
  void promise.finally(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return settled;
}

describe('store flushSync', () => {
  it('hands the session over only once a write still under way has been stored', async () => {
    const { interview, onSync } = makeInterview();
    interview.dispatch(updateEgo.pending('w1', patch));

    const flushing = interview.flushSync();
    expect(await hasSettled(flushing)).toBe(false);

    interview.dispatch(updateEgo.fulfilled(patch, 'w1', patch));
    await flushing;

    expect(onSync).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({
        network: expect.objectContaining({
          ego: expect.objectContaining({
            [entityAttributesProperty]: { agrees: true },
          }),
        }),
      }),
      expect.anything(),
    );
  });

  it('does not wait for a write still under way while the page unloads', async () => {
    const { interview } = makeInterview();
    interview.dispatch(updateEgo.pending('w1', patch));

    expect(await hasSettled(interview.flushSync({ unloading: true }))).toBe(
      true,
    );
  });
});
