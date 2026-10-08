import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import {
  asEntityAttributeReference,
  getLocaleMetadata,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../contract/types';
import Shell from '../Shell';
import { updateEgo } from '../store/modules/session';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

// What a stage is given to count a save waiting its turn as under way.
const stageWrites = vi.hoisted(
  (): { trackWrite?: (stored: Promise<boolean>) => void } => ({}),
);

vi.mock('../interfaces', async () => {
  const { useTrackWrite } = await import('../store/WritesInFlightContext');
  const ObservedInterface = ({ stage }: { stage: { id: string } }) => {
    stageWrites.trackWrite = useTrackWrite();
    return <div data-testid="stage" data-stage-interface={stage.id} />;
  };

  return { default: () => ObservedInterface };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('IntersectionObserver', ResizeObserverStub);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

const payload = {
  session: {
    id: 'session-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    localePreference: null,
    locale: null,
    localeOptions: [getLocaleMetadata('en')],
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego-1',
        [entityAttributesProperty]: {},
      },
      nodes: [],
      edges: [],
    },
  },
  protocol: {
    id: 'protocol-1',
    hash: 'protocol-hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    name: 'Writes-in-flight protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {
      ego: {
        variables: {
          agrees: { name: 'agrees', label: 'Agrees', type: 'boolean' },
        },
      },
      node: {},
      edge: {},
    },
    assets: [],
    stages: [
      {
        id: 'first-stage',
        type: 'Information',
        label: { en: 'First stage' },
        title: { en: 'First stage' },
        items: [],
      },
      {
        id: 'agreed-stage',
        type: 'Information',
        label: { en: 'Agreed stage' },
        title: { en: 'Agreed stage' },
        items: [],
        skipLogic: {
          action: 'SKIP',
          filter: {
            join: 'AND',
            rules: [
              {
                id: 'does-not-agree',
                type: 'ego',
                options: {
                  attribute: asEntityAttributeReference('agrees'),
                  operator: 'EXACTLY',
                  value: false,
                },
              },
            ],
          },
        },
      },
      {
        id: 'last-stage',
        type: 'Information',
        label: { en: 'Last stage' },
        title: { en: 'Last stage' },
        items: [],
      },
    ],
  },
} satisfies InterviewPayload;

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

function liveStore() {
  const store = window.__interviewStore;
  if (!store) throw new Error('store not exposed');
  return store;
}

const declined = { set: { agrees: false }, unset: [] };

async function renderShell(onExit?: () => void) {
  render(
    <Shell
      payload={payload}
      onSync={() => Promise.resolve()}
      onProtocolLocaleChange={() => Promise.resolve()}
      requestedLocales={[]}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      onExit={onExit}
      flags={{ isE2E: true }}
    />,
    { wrapper: WithoutMotion },
  );
  const next = await screen.findByRole('button', { name: 'Next Step' });
  return { next, store: liveStore() };
}

const shownStage = () =>
  screen.getByTestId('stage').getAttribute('data-stage-interface');

async function exitInterview() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('settings-button'));
  await user.click(await screen.findByTestId('exit-button'));
  const dialog = await screen.findByRole('dialog', {
    name: 'Exit this interview?',
  });
  await user.click(
    await within(dialog).findByRole('button', { name: 'Exit interview' }),
  );
}

describe('Shell leaving a stage with a write under way', () => {
  it('chooses the next stage with an answer still being stored', async () => {
    const { next, store } = await renderShell();
    act(() => {
      store.dispatch(updateEgo.pending('w1', declined));
    });

    await userEvent.setup().click(next);
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(shownStage()).toBe('first-stage');

    act(() => {
      store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
    });
    await waitFor(() => expect(shownStage()).toBe('last-stage'));
  });

  it('stays on the stage when an answer still being stored is refused', async () => {
    const { next, store } = await renderShell();
    act(() => {
      store.dispatch(updateEgo.pending('w1', declined));
    });

    await userEvent.setup().click(next);
    act(() => {
      store.dispatch(updateEgo.rejected(new Error('refused'), 'w1', declined));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(shownStage()).toBe('first-stage');

    await userEvent.setup().click(next);
    await waitFor(() => expect(shownStage()).toBe('agreed-stage'));
  });
});

describe('Shell closing the interview with a write under way', () => {
  const exitConfirmation = () =>
    screen.queryByRole('dialog', { name: 'Exit this interview?' });

  it('keeps the confirmation open until an answer still being stored is stored, then exits', async () => {
    const onExit = vi.fn();
    const { store } = await renderShell(onExit);
    act(() => {
      store.dispatch(updateEgo.pending('w1', declined));
    });

    await exitInterview();
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(onExit).not.toHaveBeenCalled();
    expect(exitConfirmation()).not.toBeNull();

    act(() => {
      store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
    });
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('stays open when the participant cancels while an answer is still being stored', async () => {
    const onExit = vi.fn();
    const { store } = await renderShell(onExit);
    act(() => {
      store.dispatch(updateEgo.pending('w1', declined));
    });

    await exitInterview();
    const dialog = exitConfirmation();
    if (!dialog) throw new Error('the confirmation closed');
    await userEvent
      .setup()
      .click(within(dialog).getByRole('button', { name: 'Cancel' }));
    act(() => {
      store.dispatch(updateEgo.fulfilled(declined, 'w1', declined));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));

    expect(onExit).not.toHaveBeenCalled();
  });

  it('stays open when an answer still being stored is refused', async () => {
    const onExit = vi.fn();
    const { store } = await renderShell(onExit);
    act(() => {
      store.dispatch(updateEgo.pending('w1', declined));
    });

    await exitInterview();
    act(() => {
      store.dispatch(updateEgo.rejected(new Error('refused'), 'w1', declined));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(onExit).not.toHaveBeenCalled();

    await exitInterview();
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });

  it('stays open when a save the stage has waiting its turn is refused', async () => {
    const onExit = vi.fn();
    await renderShell(onExit);
    let settleSave: (stored: boolean) => void = () => undefined;
    act(() => {
      stageWrites.trackWrite?.(
        new Promise<boolean>((resolve) => {
          settleSave = resolve;
        }),
      );
    });

    await exitInterview();
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(onExit).not.toHaveBeenCalled();
    act(() => {
      settleSave(false);
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(onExit).not.toHaveBeenCalled();

    await exitInterview();
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });
});
