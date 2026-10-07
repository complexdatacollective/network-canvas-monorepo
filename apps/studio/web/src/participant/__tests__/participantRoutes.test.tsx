import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  LinkToken,
  SessionToken,
  StudyId,
} from '@codaco/studio-contract/schema/ids';
import {
  LinkUnavailable,
  SessionEnded,
} from '@codaco/studio-contract/schema/participant';

import { createAppRouter } from '../../router.tsx';
import { installFetchStub } from '../../test/fetchStub.ts';
import {
  installParticipantHarness,
  type ParticipantHandlers,
} from '../../test/participantHarness.ts';
import { readStoredSession, storeSession } from '../storedSessions.ts';

const fetchStub = installFetchStub();

const LINK = LinkToken.make('l'.repeat(32));
const SESSION = SessionToken.make('s'.repeat(32));
const EARLIER_SESSION = SessionToken.make('e'.repeat(32));

const sessionPayload = (stageIndex: number, analytics = false) => ({
  analytics,
  studyId: StudyId.make('00000000-0000-4000-8000-000000000002'),
  holderEpoch: 2,
  revision: '5',
  stageIndex,
  stageId: stageIndex === 0 ? 'welcome' : null,
  session: {
    id: 'session-1',
    startTime: '2026-10-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-10-01T00:00:00.000Z',
    network: {
      nodes: [],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    },
    stageMetadata: {},
  },
  protocol: {
    id: 'version-1',
    hash: 'protocol-hash',
    importedAt: '2026-10-01T00:00:00.000Z',
    name: 'Participant route protocol',
    schemaVersion: 8,
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome to the study',
        items: [],
      },
    ],
  },
});

const readsSession = (
  stageIndex = 0,
  analytics = false,
): Pick<ParticipantHandlers, 'participant.session'> => ({
  'participant.session': () =>
    Effect.succeed(sessionPayload(stageIndex, analytics)),
});

const redeems: Pick<ParticipantHandlers, 'participant.redeem'> = {
  'participant.redeem': () =>
    Effect.succeed({
      sessionToken: SESSION,
      sessionId: 'session-1',
      anonymous: false,
    }),
};

function renderAt(url: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [url] }),
    queryClient,
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  );
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('opening a participant link', () => {
  it('redeems it, keeps the session for this browser, and opens the interview', async () => {
    const harness = installParticipantHarness({
      ...redeems,
      ...readsSession(),
    });

    const router = renderAt(`/enter/${LINK}`);

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Welcome to the study' },
        { timeout: 15_000 },
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/session/${SESSION}`);
    expect(harness.calls.map(({ tag }) => tag)).toEqual([
      'participant.redeem',
      'participant.session',
    ]);
    expect(harness.calls[0]?.payload).toEqual({ linkToken: LINK });
    expect(readStoredSession(LINK)).toBe(SESSION);
    expect(localStorage).toHaveLength(1);
    expect(sessionStorage).toHaveLength(1);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('keeps an anonymous link’s session to this tab', async () => {
    installParticipantHarness({
      'participant.redeem': () =>
        Effect.succeed({
          sessionToken: SESSION,
          sessionId: 'session-1',
          anonymous: true,
        }),
      ...readsSession(),
    });

    renderAt(`/enter/${LINK}`);

    await screen.findByRole(
      'heading',
      { name: 'Welcome to the study' },
      { timeout: 15_000 },
    );
    expect(readStoredSession(LINK)).toBe(SESSION);
    expect(localStorage).toHaveLength(0);
  });

  it('returns to the session this browser already holds without redeeming again', async () => {
    storeSession(LINK, EARLIER_SESSION, { anonymous: false });
    const harness = installParticipantHarness(readsSession());

    const router = renderAt(`/enter/${LINK}`);

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Welcome to the study' },
        { timeout: 15_000 },
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/session/${EARLIER_SESSION}`);
    expect(harness.calls.map(({ tag }) => tag)).toEqual([
      'participant.session',
    ]);
  });

  it('redeems again when the session this browser held was replaced', async () => {
    storeSession(LINK, EARLIER_SESSION, { anonymous: false });
    let reads = 0;
    const harness = installParticipantHarness(
      { ...redeems, ...readsSession() },
      {
        refuseSession: () => {
          reads += 1;
          return reads === 1;
        },
      },
    );

    const router = renderAt(`/enter/${LINK}`);

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Welcome to the study' },
        { timeout: 15_000 },
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/session/${SESSION}`);
    expect(harness.calls.map(({ tag }) => tag)).toEqual([
      'participant.session',
      'participant.redeem',
      'participant.session',
    ]);
    expect(readStoredSession(LINK)).toBe(SESSION);
  });

  it('says why a link cannot be used', async () => {
    installParticipantHarness({
      'participant.redeem': () =>
        Effect.fail(new LinkUnavailable({ state: 'paused' })),
    });

    renderAt(`/enter/${LINK}`);

    expect(
      await screen.findByRole('heading', { name: 'This study is paused' }),
    ).toHaveAttribute('data-route-focus-target');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your answers up to a moment ago are saved. Please try again later.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('tells a participant reopening a finished interview that it is finished', async () => {
    storeSession(LINK, EARLIER_SESSION, { anonymous: false });
    const harness = installParticipantHarness({
      'participant.session': () =>
        Effect.fail(new SessionEnded({ state: 'completed' })),
    });

    renderAt(`/enter/${LINK}`);

    expect(
      await screen.findByRole('heading', {
        name: "You've finished this interview",
      }),
    ).toBeInTheDocument();
    expect(harness.calls.map(({ tag }) => tag)).toEqual([
      'participant.session',
    ]);
  });
});

describe('the interview session', () => {
  it('finishes from the runtime’s own finish stage and shows the finished notice', async () => {
    const harness = installParticipantHarness({
      ...readsSession(1),
      'participant.finish': () => Effect.succeed({ state: 'completed' }),
    });

    renderAt(`/session/${SESSION}`);

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Finish' },
        { timeout: 15_000 },
      ),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Finish Interview' }),
    );

    const finished = await screen.findByRole('heading', {
      name: "You've finished this interview",
    });
    await waitFor(() => {
      expect(finished).toHaveFocus();
    });
    await waitFor(() => {
      expect(harness.calls.at(-1)).toEqual({
        tag: 'participant.finish',
        payload: { holderEpoch: 2, revision: '5' },
      });
    });
  });

  it('sends a session address that is not a session token back to the link', async () => {
    const harness = installParticipantHarness({});

    renderAt('/session/not-a-token');

    expect(
      await screen.findByRole('heading', { name: 'This interview has ended' }),
    ).toBeInTheDocument();
    expect(harness.calls).toEqual([]);
  });

  it('sends a participant whose session was opened from their link elsewhere back to the link', async () => {
    installParticipantHarness(readsSession(), { refuseSession: () => true });

    renderAt(`/session/${SESSION}`);

    expect(
      await screen.findByRole('heading', { name: 'This interview has ended' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Open the link you were sent to continue, or contact the research team.',
    );
  });
});

describe('participant analytics', () => {
  const finishInterview = async () => {
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Finish' },
        { timeout: 15_000 },
      ),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Finish Interview' }),
    );
    await screen.findByRole('heading', {
      name: "You've finished this interview",
    });
  };

  it('sends the runtime’s events to Studio, unidentified, when the session allows it', async () => {
    const harness = installParticipantHarness({
      ...readsSession(1, true),
      'participant.finish': () => Effect.succeed({ state: 'completed' }),
      'participant.analytics': () => Effect.void,
    });

    renderAt(`/session/${SESSION}`);
    await finishInterview();
    window.dispatchEvent(new Event('pagehide'));

    await waitFor(() => {
      expect(harness.calls.map(({ tag }) => tag)).toContain(
        'participant.analytics',
      );
    });
    const sent = harness.calls
      .filter(({ tag }) => tag === 'participant.analytics')
      .flatMap(
        ({ payload }) =>
          (payload as { events: { properties: Record<string, unknown> }[] })
            .events,
      );
    expect(sent.length).toBeGreaterThan(0);
    for (const { properties } of sent) {
      expect(properties).toMatchObject({
        app: 'studio',
        distinct_id: expect.any(String),
      });
    }
    const serialised = JSON.stringify(sent);
    expect(serialised).not.toContain(SESSION);
    expect(serialised).not.toContain('session-1');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('builds no client and sends nothing when the session carries no analytics', async () => {
    const harness = installParticipantHarness({
      ...readsSession(1),
      'participant.finish': () => Effect.succeed({ state: 'completed' }),
    });

    renderAt(`/session/${SESSION}`);
    await finishInterview();
    window.dispatchEvent(new Event('pagehide'));

    expect(harness.calls.map(({ tag }) => tag)).not.toContain(
      'participant.analytics',
    );
  });
});
