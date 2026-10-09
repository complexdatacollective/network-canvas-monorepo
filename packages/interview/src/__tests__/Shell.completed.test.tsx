import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { getLocaleMetadata } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type {
  CompletedAction,
  FinishHandler,
  InterviewPayload,
  ProtocolLocaleChangeHandler,
} from '../contract/types';
import Shell from '../Shell';

// Keep the actual Information and FinishSession interfaces, Navigation and
// dialogs; avoid importing unrelated WebGL stages into jsdom.
vi.mock('../interfaces', async () => {
  const { default: Information } =
    await import('../interfaces/Information/Information');
  const { default: FinishSession } =
    await import('../interfaces/FinishSession/FinishSession');
  return {
    default: (type: string) =>
      type === 'FinishSession' ? FinishSession : Information,
  };
});

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

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

const NOTICE =
  'This interview is finished, and its answers can no longer be changed.';

const information = {
  id: 'overview',
  type: 'Information' as const,
  label: { en: 'Overview' },
  title: { en: 'Study overview' },
  items: [],
};

const finishStage = {
  id: 'end-ineligible',
  type: 'FinishSession' as const,
  label: { en: 'Finish' },
  title: { en: 'All *done*' },
  content: { en: 'Thank you for **taking part**.' },
  finishLabel: { en: 'Finish' },
  finishConfirmation: { en: 'Finish this interview?' },
  finishedNotice: { en: NOTICE },
  finishFailed: { en: 'The interview could not be finished.' },
  outcome: 'ineligible' as const,
};

function makePayload(
  finished: { finishStageId?: string | null } | null,
): InterviewPayload {
  return {
    session: {
      id: 'completed-session',
      startTime: '2026-01-01T00:00:00.000Z',
      finishTime: finished ? '2026-01-02T00:00:00.000Z' : null,
      ...(finished && 'finishStageId' in finished
        ? { finishStageId: finished.finishStageId }
        : {}),
      exportTime: null,
      lastUpdated: '2026-01-01T00:00:00.000Z',
      localePreference: null,
      locale: null,
      localeOptions: [getLocaleMetadata('en')],
      network: {
        ego: {
          [entityPrimaryKeyProperty]: 'ego',
          [entityAttributesProperty]: {},
        },
        nodes: [],
        edges: [],
      },
    },
    protocol: {
      id: 'completed-protocol',
      hash: 'completed-hash',
      importedAt: '2026-01-01T00:00:00.000Z',
      name: 'Completed protocol',
      schemaVersion: 9,
      localization: { defaultLocale: 'en', locales: ['en'] },
      codebook: { ego: { variables: {} }, node: {}, edge: {} },
      assets: [],
      stages: [information, finishStage],
    },
  };
}

function WithoutMotion({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimations reducedMotion="always">
      {children}
    </AnimationProvider>
  );
}

function renderShell({
  payload,
  currentStep = 0,
  onFinish = () => Promise.resolve(),
  completedActions,
  reviewMode,
  initialTextScale,
  onExit,
  openFinishedAsActive,
}: {
  payload: InterviewPayload;
  currentStep?: number;
  onFinish?: FinishHandler;
  completedActions?: readonly CompletedAction[];
  reviewMode?: boolean;
  initialTextScale?: number;
  onExit?: () => void;
  openFinishedAsActive?: boolean;
}) {
  return render(
    <Shell
      payload={payload}
      currentStep={currentStep}
      onStepChange={() => undefined}
      onSync={() => Promise.resolve()}
      onProtocolLocaleChange={() => Promise.resolve()}
      requestedLocales={['en']}
      onFinish={onFinish}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      completedActions={completedActions}
      reviewMode={reviewMode}
      initialTextScale={initialTextScale}
      onExit={onExit}
      openFinishedAsActive={openFinishedAsActive}
    />,
    { wrapper: WithoutMotion },
  );
}

const expectCompletedState = async () => {
  expect(
    await screen.findByRole('heading', { name: 'All done' }),
  ).toBeInTheDocument();
  expect(screen.getByText(NOTICE)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next Step' })).toBeNull();
  expect(screen.queryByTestId('previous-button')).toBeNull();
  expect(screen.queryByText('Study overview')).toBeNull();
};

describe('Shell completed state', () => {
  it('opens a finished interview on the finish stage it ended at, whatever step the host asks for', async () => {
    renderShell({
      payload: makePayload({ finishStageId: finishStage.id }),
      currentStep: 0,
    });
    await expectCompletedState();
    expect(screen.getByRole('heading', { name: 'All done' })).not.toHaveFocus();
  });

  it('opens an interview finished without a recorded finish stage on the protocol finish stage', async () => {
    renderShell({ payload: makePayload({}) });
    await expectCompletedState();
  });

  it('offers the host action, and only that', async () => {
    const onAction = vi.fn();
    renderShell({
      payload: makePayload({ finishStageId: finishStage.id }),
      completedActions: [{ label: 'Exit', onAction }],
    });
    await expectCompletedState();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exit' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  // With no navigation, and a host that guards the browser's Back button,
  // the host's exit is the only way out of such a review.
  it('offers the host’s exit on a review with nothing before the finish stage', async () => {
    const onExit = vi.fn();
    const payload = makePayload(null);
    payload.protocol.stages = [finishStage];
    renderShell({ payload, reviewMode: true, onExit });

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Exit review' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows the interview itself, not the completed state, to a review', async () => {
    renderShell({
      payload: makePayload({ finishStageId: finishStage.id }),
      reviewMode: true,
    });
    expect(
      await screen.findByRole('heading', { name: 'Study overview' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  // Fresco with completed interviews not frozen: a researcher can still
  // change a finished interview.
  it('opens a finished interview at its stages when the host opens it as active', async () => {
    renderShell({
      payload: makePayload({ finishStageId: finishStage.id }),
      currentStep: 0,
      openFinishedAsActive: true,
    });

    expect(
      await screen.findByRole('heading', { name: 'Study overview' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next Step' })).toBeEnabled();
  });

  it('finishing reports the stage and outcome, then shows the completed state with focus on its heading', async () => {
    const onFinish = vi.fn<FinishHandler>(() => Promise.resolve());
    renderShell({ payload: makePayload(null), currentStep: 1, onFinish });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(screen.queryByText(NOTICE)).not.toBeNull());
    expect(onFinish).toHaveBeenCalledWith(
      'completed-session',
      { stageId: finishStage.id, outcome: 'ineligible' },
      expect.any(AbortSignal),
    );
    await expectCompletedState();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'All done' })).toHaveFocus(),
    );
  });

  // An Architect preview of a protocol whose finish stage has no heading yet
  // (a new protocol in a language with no supplied closing text).
  it('puts focus on the notice when the finish stage has no heading', async () => {
    const payload = makePayload(null);
    const untitled = {
      ...payload,
      protocol: {
        ...payload.protocol,
        stages: [information, { ...finishStage, title: {} }],
      },
    };
    renderShell({ payload: untitled, currentStep: 1 });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    const notice = await screen.findByText(NOTICE);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    await waitFor(() =>
      expect(notice.closest('[tabindex="-1"]')).toHaveFocus(),
    );
  });

  it('stays on the finish stage when the host could not record the finish', async () => {
    const onFinish = vi.fn<FinishHandler>(() =>
      Promise.reject(new Error('offline')),
    );
    renderShell({ payload: makePayload(null), currentStep: 1, onFinish });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    expect(
      await within(dialog).findByText(/The interview could not be finished/),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  // A protocol whose only stage is its finish stage has nothing to review.
  // Its finish stage's text is shown read-only: no Finish button, and no
  // notice that the interview is finished, because it is not.
  it('shows a review with nothing before the finish stage its text, without a way to finish', async () => {
    const onAction = vi.fn();
    const payload = makePayload(null);
    payload.protocol.stages = [finishStage];
    renderShell({
      payload,
      reviewMode: true,
      completedActions: [{ label: 'Exit', onAction }],
    });

    expect(
      await screen.findByRole('heading', { name: 'All done' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next Step' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exit' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('keeps the participant’s text size when an interview is opened finished', async () => {
    const { container } = renderShell({
      payload: makePayload({ finishStageId: finishStage.id }),
      initialTextScale: 1.3,
    });
    await expectCompletedState();
    expect(
      container
        .querySelector('main')
        ?.style.getPropertyValue('--interview-text-scale'),
    ).toBe('1.3');
  });

  it('keeps the participant’s text size from the interview into its completed state', async () => {
    const { container } = renderShell({
      payload: makePayload(null),
      currentStep: 1,
      initialTextScale: 1.2,
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    await expectCompletedState();
    expect(
      container
        .querySelector('main')
        ?.style.getPropertyValue('--interview-text-scale'),
    ).toBe('1.2');
  });

  // Exports read the language an interview was taken in. Whoever opens a
  // finished one later sees it in their own language, but that is never
  // written back over the recorded one.
  describe('the recorded language of a finished interview', () => {
    const bilingual = (finished: boolean, locale: string): InterviewPayload => {
      const payload = makePayload(
        finished ? { finishStageId: finishStage.id } : null,
      );
      return {
        session: {
          ...payload.session,
          locale,
          localeOptions: [getLocaleMetadata('en'), getLocaleMetadata('es')],
        },
        protocol: {
          ...payload.protocol,
          localization: { defaultLocale: 'en', locales: ['en', 'es'] },
          stages: [
            information,
            {
              ...finishStage,
              title: { ...finishStage.title, es: 'Todo *listo*' },
              content: { ...finishStage.content, es: 'Gracias.' },
            },
          ],
        },
      };
    };

    const shell = ({
      payload,
      requestedLocales,
      onProtocolLocaleChange,
      onFinish = () => Promise.resolve(),
    }: {
      payload: InterviewPayload;
      requestedLocales: string[];
      onProtocolLocaleChange: ProtocolLocaleChangeHandler;
      onFinish?: FinishHandler;
    }) => (
      <Shell
        payload={payload}
        currentStep={1}
        onStepChange={() => undefined}
        onSync={() => Promise.resolve()}
        onProtocolLocaleChange={onProtocolLocaleChange}
        requestedLocales={requestedLocales}
        onFinish={onFinish}
        onRequestAsset={() => Promise.resolve('')}
        analytics={{ installationId: 'test', hostApp: 'test' }}
        disableAnalytics
      />
    );

    it('is reported while the interview is under way', async () => {
      const onProtocolLocaleChange = vi
        .fn<ProtocolLocaleChangeHandler>()
        .mockResolvedValue(undefined);
      render(
        shell({
          payload: bilingual(false, 'es'),
          requestedLocales: ['en'],
          onProtocolLocaleChange,
        }),
        { wrapper: WithoutMotion },
      );
      await waitFor(() =>
        expect(onProtocolLocaleChange).toHaveBeenCalledWith(
          'completed-session',
          { locale: 'en', localePreference: null },
        ),
      );
    });

    it('is not overwritten by opening the interview finished in another language', async () => {
      const onProtocolLocaleChange = vi
        .fn<ProtocolLocaleChangeHandler>()
        .mockResolvedValue(undefined);
      render(
        shell({
          payload: bilingual(true, 'es'),
          requestedLocales: ['en'],
          onProtocolLocaleChange,
        }),
        { wrapper: WithoutMotion },
      );
      // Shown in the language of whoever opened it.
      expect(
        await screen.findByRole('heading', { name: 'All done' }),
      ).toBeInTheDocument();
      expect(screen.getByText(NOTICE)).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onProtocolLocaleChange).not.toHaveBeenCalled();
    });

    it('is not overwritten once the interview is finished here', async () => {
      const onProtocolLocaleChange = vi
        .fn<ProtocolLocaleChangeHandler>()
        .mockResolvedValue(undefined);
      // The same payload throughout: a new one is a new interview.
      const payload = bilingual(false, 'en');
      const { rerender } = render(
        shell({
          payload,
          requestedLocales: ['en'],
          onProtocolLocaleChange,
        }),
        { wrapper: WithoutMotion },
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Finish' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Finish' }));
      await waitFor(() => expect(screen.queryByText(NOTICE)).not.toBeNull());

      rerender(
        shell({
          payload,
          requestedLocales: ['es'],
          onProtocolLocaleChange,
        }),
      );

      expect(
        await screen.findByRole('heading', { name: 'Todo listo' }),
      ).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(onProtocolLocaleChange).not.toHaveBeenCalled();
    });
  });
});
