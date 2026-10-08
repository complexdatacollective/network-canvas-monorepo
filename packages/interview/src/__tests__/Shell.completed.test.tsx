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
  completedAction,
  reviewMode,
}: {
  payload: InterviewPayload;
  currentStep?: number;
  onFinish?: FinishHandler;
  completedAction?: CompletedAction;
  reviewMode?: boolean;
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
      completedAction={completedAction}
      reviewMode={reviewMode}
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
      completedAction: { label: 'Exit', onAction },
    });
    await expectCompletedState();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exit' }));
    expect(onAction).toHaveBeenCalledTimes(1);
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

  it('finishing reports the stage and outcome, then shows the completed state with focus on its heading', async () => {
    const onFinish = vi.fn<FinishHandler>(() => Promise.resolve());
    renderShell({ payload: makePayload(null), currentStep: 1, onFinish });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Finish Interview' }),
    );

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

  it('stays on the finish stage when the host could not record the finish', async () => {
    const onFinish = vi.fn<FinishHandler>(() =>
      Promise.reject(new Error('offline')),
    );
    renderShell({ payload: makePayload(null), currentStep: 1, onFinish });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Finish Interview' }),
    );

    expect(
      await within(dialog).findByText(/The interview could not be finished/),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
