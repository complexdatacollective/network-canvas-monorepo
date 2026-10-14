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

const FINISHED_TEXT = 'Thank you for participating!';

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
  mode: 'confirmation' as const,
  label: { en: 'Finish' },
  content: { en: '# All *done*\n\nThank you for **taking part**.' },
  finishedContent: { en: `# Interview finished\n\n${FINISHED_TEXT}` },
  finishLabel: { en: 'Finish' },
  finishConfirmation: { en: 'Finish this interview?' },
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
    await screen.findByRole('heading', { name: 'Interview finished' }),
  ).toBeInTheDocument();
  expect(screen.getByText(FINISHED_TEXT)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'All done' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next Step' })).toBeNull();
  expect(screen.queryByTestId('previous-button')).toBeNull();
  expect(screen.queryByText('Study overview')).toBeNull();
};

/** The finished screen's text, which takes focus once the interview ends. */
const finishedText = () =>
  screen
    .getByRole('heading', { name: 'Interview finished' })
    .closest('[tabindex="-1"]');

describe('Shell completed state', () => {
  it('opens a finished interview on the finish stage it ended at, whatever step the host asks for', async () => {
    renderShell({
      payload: makePayload({ finishStageId: finishStage.id }),
      currentStep: 0,
    });
    await expectCompletedState();
    expect(finishedText()).not.toHaveFocus();
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
    expect(screen.queryByText(FINISHED_TEXT)).toBeNull();
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
    expect(screen.queryByText(FINISHED_TEXT)).toBeNull();
    expect(screen.getByRole('button', { name: 'Next Step' })).toBeEnabled();
  });

  it('finishing reports the stage and outcome, then shows the completed state with focus on its heading', async () => {
    const onFinish = vi.fn<FinishHandler>(() => Promise.resolve());
    renderShell({ payload: makePayload(null), currentStep: 1, onFinish });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    await waitFor(() =>
      expect(screen.queryByText(FINISHED_TEXT)).not.toBeNull(),
    );
    expect(onFinish).toHaveBeenCalledWith(
      'completed-session',
      { stageId: finishStage.id, outcome: 'ineligible' },
      expect.any(AbortSignal),
    );
    await expectCompletedState();
    await waitFor(() => expect(finishedText()).toHaveFocus());
  });

  // A researcher may leave the heading out of the finished text.
  it('puts focus on the finished text when it has no heading', async () => {
    const payload = makePayload(null);
    const untitled = {
      ...payload,
      protocol: {
        ...payload.protocol,
        stages: [
          information,
          { ...finishStage, finishedContent: { en: FINISHED_TEXT } },
        ],
      },
    };
    renderShell({ payload: untitled, currentStep: 1 });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    const text = await screen.findByText(FINISHED_TEXT);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    await waitFor(() => expect(text.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('returns to the closing screen with a toast when the host could not record the finish', async () => {
    const onFinish = vi.fn<FinishHandler>(() =>
      Promise.reject(new Error('offline')),
    );
    renderShell({ payload: makePayload(null), currentStep: 1, onFinish });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Finish' }));

    expect(
      await screen.findByText(/The interview could not be finished/),
    ).toBeInTheDocument();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(
      screen.getByRole('heading', { name: 'All done' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();
    expect(screen.queryByText(FINISHED_TEXT)).toBeNull();
  });

  it('never moves forward from a finish stage, but lets the participant go back in confirmation mode', async () => {
    renderShell({ payload: makePayload(null), currentStep: 1 });
    await screen.findByRole('button', { name: 'Finish' });
    expect(screen.getByRole('button', { name: 'Next Step' })).toBeDisabled();
    expect(screen.getByTestId('previous-button')).toBeEnabled();
  });

  describe('automatic mode', () => {
    const automatic = (payload: InterviewPayload) => {
      payload.protocol.stages = [
        information,
        { ...finishStage, mode: 'automatic' },
      ];
      return payload;
    };

    it('finishes as soon as it is shown, with no closing screen or question', async () => {
      const onFinish = vi.fn<FinishHandler>(() => Promise.resolve());
      renderShell({
        payload: automatic(makePayload(null)),
        currentStep: 1,
        onFinish,
      });

      await expectCompletedState();
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith(
        'completed-session',
        { stageId: finishStage.id, outcome: 'ineligible' },
        expect.any(AbortSignal),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText('Thank you for taking part.')).toBeNull();
      await waitFor(() => expect(finishedText()).toHaveFocus());
    });

    // Fresco with completed interviews not frozen reopens a finished one to
    // be changed, at the stage it finished on.
    it('reopens a finished interview to be changed at the stage before, without finishing again', async () => {
      const onFinish = vi.fn<FinishHandler>(() => Promise.resolve());
      renderShell({
        payload: automatic(makePayload({ finishStageId: finishStage.id })),
        currentStep: 1,
        openFinishedAsActive: true,
        onFinish,
      });

      expect(
        await screen.findByRole('heading', { name: 'Study overview' }),
      ).toBeInTheDocument();
      expect(onFinish).not.toHaveBeenCalled();
    });

    it('keeps a finished interview with nothing before its automatic ending finished when reopened to be changed', async () => {
      const onFinish = vi.fn<FinishHandler>(() => Promise.resolve());
      const payload = automatic(makePayload({ finishStageId: finishStage.id }));
      payload.protocol.stages = payload.protocol.stages.filter(
        (stage) => stage.type === 'FinishSession',
      );
      renderShell({
        payload,
        currentStep: 0,
        openFinishedAsActive: true,
        onFinish,
      });

      await expectCompletedState();
      expect(onFinish).not.toHaveBeenCalled();
    });

    it('allows no navigation either way while it finishes', async () => {
      renderShell({
        payload: automatic(makePayload(null)),
        currentStep: 1,
        // Never settles, so the stage stays on screen.
        onFinish: () => new Promise(() => undefined),
      });

      const next = await screen.findByRole('button', { name: 'Next Step' });
      expect(next).toBeDisabled();
      expect(screen.getByTestId('previous-button')).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
    });

    it('says when it could not finish, and offers to try again', async () => {
      const onFinish = vi
        .fn<FinishHandler>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined);
      renderShell({
        payload: automatic(makePayload(null)),
        currentStep: 1,
        onFinish,
      });

      expect(
        await screen.findByText(/The interview could not be finished/),
      ).toBeInTheDocument();
      await userEvent
        .setup()
        .click(await screen.findByRole('button', { name: 'Finish' }));

      await expectCompletedState();
      expect(onFinish).toHaveBeenCalledTimes(2);
    });
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
    expect(screen.queryByText(FINISHED_TEXT)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next Step' })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exit' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  // An automatic finish stage has no closing text, so its finished text is
  // what such a review shows.
  it('shows a review with only an automatic finish stage its finished text', async () => {
    const payload = makePayload(null);
    payload.protocol.stages = [{ ...finishStage, mode: 'automatic' }];
    renderShell({ payload, reviewMode: true });

    expect(await screen.findByText(FINISHED_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All done' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
  });

  // Only the first of several endings can be reached with nothing before it.
  it('shows a review with only finish stages the first one', async () => {
    const payload = makePayload(null);
    payload.protocol.stages = [
      { ...finishStage, id: 'end-first', mode: 'automatic' },
      { ...finishStage, id: 'end-second' },
    ];
    renderShell({ payload, reviewMode: true });

    expect(await screen.findByText(FINISHED_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All done' })).toBeNull();
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
});
