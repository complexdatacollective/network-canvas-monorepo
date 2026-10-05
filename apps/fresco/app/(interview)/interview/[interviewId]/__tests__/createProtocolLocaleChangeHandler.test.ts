import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProtocolLocaleChangeHandler } from '../createProtocolLocaleChangeHandler';

type Pending = { body: unknown; respond: (ok: boolean) => void };

function makeFetch() {
  const pending: Pending[] = [];
  const fetchMock = vi.fn(
    (_url: string, init: { body: string }) =>
      new Promise((resolve) => {
        pending.push({
          body: JSON.parse(init.body),
          respond: (ok) => resolve({ ok }),
        });
      }),
  );
  return { fetchMock, pending };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createProtocolLocaleChangeHandler', () => {
  it('posts both locale fields to the interview’s locale route', async () => {
    const { fetchMock, pending } = makeFetch();
    vi.stubGlobal('fetch', fetchMock);
    const onChange = createProtocolLocaleChangeHandler();

    const write = onChange('interview-1', {
      locale: 'fr',
      localePreference: 'fr',
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledWith(
      '/interview/interview-1/locale',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(pending[0]?.body).toEqual({ locale: 'fr', localePreference: 'fr' });

    pending[0]?.respond(true);
    await expect(write).resolves.toBeUndefined();
  });

  it('sends a change only once the one before it has settled', async () => {
    const { fetchMock, pending } = makeFetch();
    vi.stubGlobal('fetch', fetchMock);
    const onChange = createProtocolLocaleChangeHandler();

    const first = onChange('interview-1', {
      locale: 'en',
      localePreference: null,
    });
    const second = onChange('interview-1', {
      locale: 'fr',
      localePreference: 'fr',
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    pending[0]?.respond(true);
    await first;
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1]?.body).toEqual({ locale: 'fr', localePreference: 'fr' });

    pending[1]?.respond(true);
    await expect(second).resolves.toBeUndefined();
  });

  it('rejects a failed write without holding back the next one', async () => {
    const { fetchMock, pending } = makeFetch();
    vi.stubGlobal('fetch', fetchMock);
    const onChange = createProtocolLocaleChangeHandler();

    const failed = onChange('interview-1', {
      locale: 'en',
      localePreference: null,
    });
    const next = onChange('interview-1', {
      locale: 'fr',
      localePreference: 'fr',
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    pending[0]?.respond(false);
    await expect(failed).rejects.toThrow('Locale change failed');

    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]?.respond(true);
    await expect(next).resolves.toBeUndefined();
  });
});
