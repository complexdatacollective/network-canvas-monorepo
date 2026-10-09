import { describe, expect, it, vi } from 'vitest';

import { getLocaleMetadata } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import type {
  InterviewPayload,
  ProtocolLocaleChangeHandler,
} from '../../contract/types';
import { setLocalePreference, updateEgo } from '../modules/session';
import { store as createStore } from '../store';

const patch = { set: { agrees: true }, unset: [] };

function makeInterview(
  onProtocolLocaleChange: ProtocolLocaleChangeHandler = () => Promise.resolve(),
) {
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
      localePreference: null,
      locale: null,
      localeOptions: [getLocaleMetadata('en')],
    },
    protocol: {
      id: 'protocol-1',
      hash: 'hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      assets: [],
      codebook: {
        ego: {
          variables: {
            agrees: { name: 'Agrees', label: 'Agrees', type: 'boolean' },
          },
        },
      },
      stages: [],
    },
  };
  const onSync = vi.fn(() => Promise.resolve());
  return {
    interview: createStore(payload, {
      onSync,
      onProtocolLocaleChange,
    }),
    onSync,
  };
}

// Whether `promise` has settled once everything already queued has run.
async function hasSettled(promise: Promise<unknown>) {
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
    await expect(flushing).resolves.toBe(true);

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

  it('says when a write still under way was refused, and still hands over what was stored', async () => {
    const { interview, onSync } = makeInterview();
    interview.dispatch(updateEgo.pending('w1', patch));
    interview.dispatch(updateEgo.pending('w2', patch));

    const flushing = interview.flushSync();
    interview.dispatch(updateEgo.fulfilled(patch, 'w1', patch));
    interview.dispatch(updateEgo.rejected(new Error('refused'), 'w2', patch));

    await expect(flushing).resolves.toBe(false);
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

  it('waits for a write still waiting its turn, and says when it was refused', async () => {
    const { interview } = makeInterview();
    let settleWrite: (stored: boolean) => void = () => undefined;
    interview.trackWrite(
      new Promise<boolean>((resolve) => {
        settleWrite = resolve;
      }),
    );

    const flushing = interview.flushSync();
    expect(await hasSettled(flushing)).toBe(false);

    settleWrite(false);
    await expect(flushing).resolves.toBe(false);
  });

  it('does not wait for a write still under way while the page unloads', async () => {
    const { interview } = makeInterview();
    interview.dispatch(updateEgo.pending('w1', patch));

    expect(await hasSettled(interview.flushSync({ unloading: true }))).toBe(
      true,
    );
  });

  it('says the interview language was not stored when recording it is refused', async () => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const onProtocolLocaleChange = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockRejectedValue(new Error('offline'));
    const { interview } = makeInterview(onProtocolLocaleChange);
    interview.dispatch(setLocalePreference('en'));

    await expect(interview.flushSync()).resolves.toBe(false);
    expect(onProtocolLocaleChange).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('hands over once a refused interview language is stored on trying again', async () => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const onProtocolLocaleChange = vi
      .fn<ProtocolLocaleChangeHandler>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { interview } = makeInterview(onProtocolLocaleChange);
    interview.dispatch(setLocalePreference('en'));

    await expect(interview.flushSync()).resolves.toBe(true);
    expect(onProtocolLocaleChange).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('says the session was not stored when the host refuses to sync it', async () => {
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    const { interview, onSync } = makeInterview();
    onSync.mockRejectedValue(new Error('offline'));
    interview.dispatch(updateEgo.pending('w1', patch));
    interview.dispatch(updateEgo.fulfilled(patch, 'w1', patch));

    await expect(interview.flushSync()).resolves.toBe(false);
    vi.restoreAllMocks();
  });
});
