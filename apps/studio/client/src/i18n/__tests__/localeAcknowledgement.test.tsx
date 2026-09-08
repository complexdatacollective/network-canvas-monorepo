// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PSEUDO_LOCALE } from '@codaco/app-i18n/locales';

import { sessionQueryOptions } from '../../lib/session.ts';
import { StudioI18nProvider, useStudioLocale } from '../StudioI18nProvider.tsx';

/**
 * What the unacknowledged-write marker is allowed to suppress.
 *
 * `setLocale` applies a choice locally and then, when it can, writes it to the
 * account. Between those two moments a stale `me` payload must not drag the
 * researcher back to the old language — that is what the marker is for. But a
 * marker that outlives its write suppresses the account's OWN preference, and
 * every case below is one where that used to happen and the researcher was
 * left in the wrong language for the rest of the visit.
 *
 * These drive the provider directly rather than through the router, because
 * each case turns on a transition the route tests cannot stage: no session at
 * the moment of choosing, a different researcher signing in afterwards, and
 * two replies racing.
 */

const updateLocale = vi.fn();

vi.mock('../../lib/api.ts', () => ({
  orpc: {
    me: {
      queryOptions: () => ({ queryKey: ['me'], queryFn: vi.fn() }),
      key: () => ['me'],
    },
  },
  rpcClient: {
    account: { updateLocale: (...args: unknown[]) => updateLocale(...args) },
  },
}));

const MIRROR_KEY = 'studio.locale';

type Harness = {
  preference: string | null;
  saveState: string;
  setLocale: (locale: string | null) => void;
  applyServerPreference: (locale: string | null, userId: string) => void;
};

let harness: Harness;

function Probe() {
  harness = useStudioLocale();
  return null;
}

/**
 * @param signedIn seeds the session the way the real app's guards do, so
 *   `setLocale` sees the same answer it would in the browser.
 * @param userId who `me` reports; `undefined` stands for identity that has not
 *   resolved.
 */
function renderProvider({
  signedIn,
  userId,
}: {
  signedIn: boolean;
  userId: string | undefined;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(
    sessionQueryOptions.queryKey,
    signedIn ? 'signedIn' : 'signedOut',
  );
  if (userId !== undefined) {
    queryClient.setQueryData(['me'], { userId, locale: null });
  }
  render(
    <QueryClientProvider client={queryClient}>
      <StudioI18nProvider>
        <Probe />
      </StudioI18nProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  Object.defineProperty(window.navigator, 'languages', {
    value: ['en-US', 'en'],
    configurable: true,
  });
  updateLocale.mockResolvedValue({ locale: null });
});

describe('a choice that never reached the account', () => {
  it('does not suppress the account preference once the researcher signs in', () => {
    // Signed out, the mirror is the only place a choice can live. Marking it
    // as awaiting acknowledgement leaves a marker nothing can ever clear,
    // because no write was sent — and the account's own preference is then
    // ignored for the whole session that follows sign-in.
    renderProvider({ signedIn: false, userId: undefined });

    act(() => harness.setLocale('en-GB'));
    expect(updateLocale).not.toHaveBeenCalled();

    act(() => harness.applyServerPreference('en', 'user-1'));

    expect(harness.preference).toBe('en');
    expect(window.localStorage.getItem(MIRROR_KEY)).toBe('en');
  });

  it('is still written when identity has not resolved yet', async () => {
    // Signed in, with nobody yet to attribute the write to. The request needs
    // no identity — the session cookie carries it — so dropping it lost the
    // choice outright: no write went out, no marker was left, and the `me`
    // payload that arrived moments later put the researcher back on the
    // language they had just moved off.
    renderProvider({ signedIn: true, userId: undefined });

    act(() => harness.setLocale('en-GB'));
    await waitFor(() =>
      expect(updateLocale).toHaveBeenCalledWith({ locale: 'en-GB' }),
    );

    act(() => harness.applyServerPreference('en', 'user-1'));

    expect(harness.preference).toBe('en-GB');
  });

  it('is dropped when the session ends before identity ever arrives', async () => {
    // The write above is owned by "whoever this session turns out to be", and
    // signing out is the moment that stops being answerable: the next identity
    // belongs to somebody else, and a marker that adopted them would refuse
    // them their own preference for the rest of their visit.
    const queryClient = renderProvider({ signedIn: true, userId: undefined });

    act(() => harness.setLocale('en-GB'));
    await waitFor(() => expect(updateLocale).toHaveBeenCalledTimes(1));

    queryClient.setQueryData(sessionQueryOptions.queryKey, 'signedOut');
    // Query notifications reach their observers on a macrotask, so the
    // provider learns the session ended one turn after the cache does.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    act(() => harness.applyServerPreference('en', 'user-2'));

    expect(harness.preference).toBe('en');
  });
});

describe('the pseudo-locale', () => {
  it('is not clobbered by the account preference', () => {
    // A development aid is never stored, so the server can only ever disagree
    // with it. Letting that disagreement win would end the session it was
    // turned on for.
    renderProvider({ signedIn: true, userId: 'user-1' });

    act(() => harness.setLocale(PSEUDO_LOCALE));
    expect(updateLocale).not.toHaveBeenCalled();

    act(() => harness.applyServerPreference('en-GB', 'user-1'));

    expect(harness.preference).toBe(PSEUDO_LOCALE);
  });
});

describe('an unacknowledged write', () => {
  it('holds against a stale payload for the account that made it', async () => {
    // The marker's actual job, kept as a guard on the cases below: this must
    // still work after all the narrowing.
    renderProvider({ signedIn: true, userId: 'user-1' });

    act(() => harness.setLocale('en-GB'));
    await waitFor(() => expect(updateLocale).toHaveBeenCalledTimes(1));

    act(() => harness.applyServerPreference('en', 'user-1'));

    expect(harness.preference).toBe('en-GB');
  });

  it('has no standing once a different researcher signs in', async () => {
    // A failed write deliberately keeps its marker. The provider is mounted at
    // the root and survives sign-out, so without an owner that marker answers
    // for the next account and locks them out of their own preference.
    updateLocale.mockRejectedValue(new Error('offline'));
    renderProvider({ signedIn: true, userId: 'user-1' });

    act(() => harness.setLocale('en-GB'));
    await waitFor(() => expect(harness.saveState).toBe('error'));

    act(() => harness.applyServerPreference('en', 'user-2'));

    expect(harness.preference).toBe('en');
  });
});

describe('two choices in quick succession', () => {
  it('reaches the server one at a time, newest last', async () => {
    // Two requests in flight can settle in either order, and the server keeps
    // whichever landed last — so an older request answering last leaves the
    // account storing a language the researcher has already moved off, with
    // this screen still reporting the newer one as saved. Only one write is on
    // the wire at a time, which is what makes the order the server sees the
    // order the researcher chose in.
    const settle: ((value: { locale: string | null }) => void)[] = [];
    updateLocale.mockImplementation(
      () => new Promise((resolve) => settle.push(resolve)),
    );
    renderProvider({ signedIn: true, userId: 'user-1' });

    act(() => harness.setLocale('en-GB'));
    await waitFor(() => expect(settle).toHaveLength(1));

    // The second choice arrives while the first request is still on the wire,
    // and waits for it rather than racing it. The flush is what makes that
    // assertable: a second request would go out on its own turn, not on this
    // one, so asserting straight after the call would pass either way.
    act(() => harness.setLocale('en'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(updateLocale).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle[0]?.({ locale: 'en-GB' });
      await Promise.resolve();
    });

    // The older reply reports nothing: its choice is no longer the
    // researcher's.
    expect(harness.saveState).toBe('saving');
    await waitFor(() => expect(settle).toHaveLength(2));
    expect(updateLocale).toHaveBeenLastCalledWith({ locale: 'en' });

    // The newer one is still outstanding, so a stale payload is still refused.
    act(() => harness.applyServerPreference('en-GB', 'user-1'));
    expect(harness.preference).toBe('en');
  });

  it('stops holding once the write lands, even when nothing about `me` changes', async () => {
    // A researcher who tries a language and goes back to the one they had ends
    // on the value the account already reported. `LocaleSync`'s effect is keyed
    // on the account and the locale, so nothing about that refetch is new and
    // it never runs — leaving a marker that refuses every later payload as
    // stale, including the preference this researcher sets on another device.
    renderProvider({ signedIn: true, userId: 'user-1' });

    act(() => harness.setLocale('en-GB'));
    act(() => harness.setLocale(null));
    await waitFor(() => expect(harness.saveState).toBe('saved'));

    act(() => harness.applyServerPreference('en-GB', 'user-1'));

    expect(harness.preference).toBe('en-GB');
  });

  it('does not send one that is still waiting when the session ends', async () => {
    // A queued write has not been sent yet, and the password form signs in
    // inside the SPA — so a write left waiting here goes out with the NEXT
    // researcher's cookie and stores this researcher's choice on their
    // account.
    const settle: ((value: { locale: string | null }) => void)[] = [];
    updateLocale.mockImplementation(
      () => new Promise((resolve) => settle.push(resolve)),
    );
    const queryClient = renderProvider({ signedIn: true, userId: 'user-1' });

    act(() => harness.setLocale('en-GB'));
    await waitFor(() => expect(settle).toHaveLength(1));
    act(() => harness.setLocale('en'));

    queryClient.setQueryData(sessionQueryOptions.queryKey, 'signedOut');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Somebody else signs in, and the first request finally answers — which is
    // what lets the queued one take its turn.
    queryClient.setQueryData(sessionQueryOptions.queryKey, 'signedIn');
    await act(async () => {
      settle[0]?.({ locale: 'en-GB' });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(updateLocale).toHaveBeenCalledTimes(1);
  });

  it('does not send a choice the researcher has already replaced', async () => {
    // The queued write is a request the server would have to process and then
    // immediately overwrite, and while it is in flight the account holds a
    // language nothing on screen ever claimed.
    const settle: ((value: { locale: string | null }) => void)[] = [];
    updateLocale.mockImplementation(
      () => new Promise((resolve) => settle.push(resolve)),
    );
    renderProvider({ signedIn: true, userId: 'user-1' });

    act(() => harness.setLocale('en-GB'));
    await waitFor(() => expect(settle).toHaveLength(1));
    act(() => harness.setLocale(null));
    act(() => harness.setLocale('en'));

    await act(async () => {
      settle[0]?.({ locale: 'en-GB' });
      await Promise.resolve();
    });

    await waitFor(() => expect(settle).toHaveLength(2));
    expect(updateLocale).toHaveBeenCalledTimes(2);
    expect(updateLocale).toHaveBeenLastCalledWith({ locale: 'en' });
  });
});
