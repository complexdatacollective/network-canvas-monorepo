import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import { AnalyticsContext } from '../AnalyticsContext';
import type { Tracker } from '../tracker';
import { useStageNavigationAnalytics } from '../useStageNavigationAnalytics';

function makeWrapper(
  tracker: Tracker,
  stages: Array<{ type: string }>,
  promptIndex = 0,
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: { promptIndex } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook: {},
        stages,
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
  return Object.assign(
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <Provider store={store}>
          <AnalyticsContext.Provider value={tracker}>
            {children}
          </AnalyticsContext.Provider>
        </Provider>
      );
    },
    { store },
  );
}

describe('useStageNavigationAnalytics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits interview_started + stage_entered on first mount', () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const wrapper = makeWrapper(tracker, [
      { type: 'Information' },
      { type: 'NameGenerator' },
    ]);
    renderHook(
      () =>
        useStageNavigationAnalytics({
          stage_index: 0,
          stage_type: 'Information',
        }),
      { wrapper },
    );

    expect(tracker.track).toHaveBeenCalledWith('interview_started');
    expect(tracker.track).toHaveBeenCalledWith(
      'stage_entered',
      expect.objectContaining({
        stage_type: 'Information',
        stage_index: 0,
        direction: 'initial',
      }),
    );
  });

  it('emits stage_exited with duration_ms on rerender to a new step', async () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const stages = [{ type: 'Information' }, { type: 'NameGenerator' }];
    const wrapper = makeWrapper(tracker, stages);
    const { rerender } = renderHook(
      (props: { stage_index: number; stage_type?: string }) =>
        useStageNavigationAnalytics(props),
      {
        wrapper,
        initialProps: { stage_index: 0, stage_type: 'Information' },
      },
    );
    await new Promise((r) => setTimeout(r, 10));
    tracker.track.mockClear();
    rerender({ stage_index: 1, stage_type: 'NameGenerator' });

    const exitCall = tracker.track.mock.calls.find(
      ([n]) => n === 'stage_exited',
    );
    expect(exitCall?.[1]).toMatchObject({
      stage_type: 'Information',
      stage_index: 0,
      exit_direction: 'forward',
    });
    expect(typeof exitCall?.[1].duration_ms).toBe('number');
  });

  it('emits the final stage exit once when the interview unmounts', async () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const BaseWrapper = makeWrapper(tracker, [{ type: 'NameGenerator' }]);
    function StrictWrapper({ children }: { children: ReactNode }) {
      return (
        <StrictMode>
          <BaseWrapper>{children}</BaseWrapper>
        </StrictMode>
      );
    }
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { unmount } = renderHook(
      () =>
        useStageNavigationAnalytics({
          stage_index: 0,
          stage_type: 'NameGenerator',
        }),
      { wrapper: StrictWrapper },
    );

    now.mockReturnValue(1175);
    unmount();
    await Promise.resolve();

    expect(
      tracker.track.mock.calls.filter(([name]) => name === 'stage_entered'),
    ).toHaveLength(1);
    expect(
      tracker.track.mock.calls.filter(([name]) => name === 'stage_exited'),
    ).toEqual([
      [
        'stage_exited',
        expect.objectContaining({
          stage_type: 'NameGenerator',
          stage_index: 0,
          duration_ms: 175,
          prompt_count: 1,
          exit_direction: 'abandoned',
        }),
      ],
    ]);
    expect(BaseWrapper.store.getState().session.stageTiming).toEqual({
      stageExits: [
        expect.objectContaining({
          stageIndex: 0,
          stageType: 'NameGenerator',
          durationMs: 175,
          exitDirection: 'abandoned',
        }),
      ],
    });
  });

  it('reports the live prompt index and count when a stage exits', () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const stages = [
      {
        type: 'NameGenerator',
        prompts: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      },
      { type: 'Information' },
    ];
    const wrapper = makeWrapper(tracker, stages, 2);
    const { rerender } = renderHook(
      (props: { stage_index: number; stage_type?: string }) =>
        useStageNavigationAnalytics(props),
      {
        wrapper,
        initialProps: { stage_index: 0, stage_type: 'NameGenerator' },
      },
    );

    rerender({ stage_index: 1, stage_type: 'Information' });

    expect(tracker.track).toHaveBeenCalledWith(
      'stage_entered',
      expect.objectContaining({
        stage_index: 0,
        prompt_index: 2,
      }),
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'stage_exited',
      expect.objectContaining({
        stage_index: 0,
        prompt_index: 2,
        prompt_count: 3,
      }),
    );
    expect(wrapper.store.getState().session.stageTiming?.stageExits).toEqual([
      expect.objectContaining({
        stageIndex: 0,
        promptIndex: 2,
        promptCount: 3,
      }),
    ]);
  });

  it('emits interview_finished when entering FinishSession stage', () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const wrapper = makeWrapper(tracker, [
      { type: 'Information' },
      { type: 'NameGenerator' },
      { type: 'FinishSession' },
    ]);
    renderHook(
      () =>
        useStageNavigationAnalytics({
          stage_index: 2,
          stage_type: 'FinishSession',
        }),
      { wrapper },
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'interview_finished',
      expect.objectContaining({
        stage_count: 3,
        total_duration_ms: expect.any(Number),
      }),
    );
    expect(wrapper.store.getState().session.stageTiming).toEqual({
      stageExits: [],
      totalDurationMs: expect.any(Number),
    });
  });

  it('does not record an unavailable render-gated step before recovery', () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const wrapper = makeWrapper(tracker, [
      { type: 'Information' },
      { type: 'AlterForm' },
    ]);
    const { rerender } = renderHook(
      (props: { stage_index: number; stage_type?: string; enabled: boolean }) =>
        useStageNavigationAnalytics(props),
      {
        wrapper,
        initialProps: {
          stage_index: 1,
          stage_type: 'AlterForm',
          enabled: false,
        },
      },
    );

    expect(tracker.track).toHaveBeenCalledWith('interview_started');
    expect(tracker.track).not.toHaveBeenCalledWith(
      'stage_entered',
      expect.anything(),
    );

    tracker.track.mockClear();
    rerender({
      stage_index: 0,
      stage_type: 'Information',
      enabled: true,
    });

    expect(tracker.track).toHaveBeenCalledWith(
      'stage_entered',
      expect.objectContaining({
        stage_type: 'Information',
        stage_index: 0,
        direction: 'initial',
      }),
    );
    expect(tracker.track).not.toHaveBeenCalledWith(
      'stage_exited',
      expect.anything(),
    );
  });
});
