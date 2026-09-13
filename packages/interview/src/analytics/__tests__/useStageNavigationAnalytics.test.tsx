import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import protocol from '../../store/modules/protocol';
import session, { updatePrompt } from '../../store/modules/session';
import ui from '../../store/modules/ui';
import { AnalyticsContext } from '../AnalyticsContext';
import type { Tracker } from '../tracker';
import { useStageNavigationAnalytics } from '../useStageNavigationAnalytics';

function makeWrapper(
  tracker: Tracker,
  stages: Array<{ type: string; prompts?: unknown[] }>,
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
  const Wrapper = function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <AnalyticsContext.Provider value={tracker}>
          {children}
        </AnalyticsContext.Provider>
      </Provider>
    );
  };
  return Object.assign(Wrapper, { store });
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
          prompt_index: 0,
          exit_direction: 'abandoned',
        }),
      ],
    ]);
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
  });

  it('emits prompt transitions with computable duration for each prompt', () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const stages = [
      {
        type: 'NameGenerator',
        prompts: [{ id: 'p1' }, { id: 'p2' }],
      },
      { type: 'Information' },
    ];
    const wrapper = makeWrapper(tracker, stages);
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    const { rerender } = renderHook(
      (props: { stage_index: number; stage_type?: string }) =>
        useStageNavigationAnalytics(props),
      {
        wrapper,
        initialProps: { stage_index: 0, stage_type: 'NameGenerator' },
      },
    );

    now.mockReturnValue(175);
    act(() => {
      wrapper.store.dispatch(updatePrompt(1));
    });

    now.mockReturnValue(240);
    rerender({ stage_index: 1, stage_type: 'Information' });

    expect(tracker.track).toHaveBeenCalledWith(
      'prompt_exited',
      expect.objectContaining({
        stage_index: 0,
        prompt_index: 0,
        prompt_count: 2,
        duration_ms: 75,
      }),
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'stage_exited',
      expect.objectContaining({
        stage_index: 0,
        prompt_index: 1,
        prompt_count: 2,
      }),
    );
  });

  it('emits interview_finished with the sum of completed stage durations', () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const wrapper = makeWrapper(tracker, [
      { type: 'Information' },
      { type: 'FinishSession' },
    ]);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { rerender } = renderHook(
      (props: { stage_index: number; stage_type?: string }) =>
        useStageNavigationAnalytics(props),
      {
        wrapper,
        initialProps: { stage_index: 0, stage_type: 'Information' },
      },
    );

    now.mockReturnValue(1125);
    rerender({
      stage_index: 1,
      stage_type: 'FinishSession',
    });

    const stageExit = tracker.track.mock.calls.find(
      ([name]) => name === 'stage_exited',
    );
    expect(stageExit?.[1]).toEqual(
      expect.objectContaining({ duration_ms: 125 }),
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'interview_finished',
      expect.objectContaining({
        stage_count: 2,
        total_duration_ms: 125,
      }),
    );
  });

  it('does not add synthetic FinishSession time to completed duration', () => {
    const tracker = { track: vi.fn(), captureException: vi.fn() };
    const wrapper = makeWrapper(tracker, [
      { type: 'Information' },
      { type: 'FinishSession' },
    ]);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { rerender, unmount } = renderHook(
      (props: { stage_index: number; stage_type?: string }) =>
        useStageNavigationAnalytics(props),
      {
        wrapper,
        initialProps: { stage_index: 0, stage_type: 'Information' },
      },
    );
    now.mockReturnValue(1125);
    rerender({ stage_index: 1, stage_type: 'FinishSession' });
    now.mockReturnValue(1500);
    unmount();

    expect(
      tracker.track.mock.calls.filter(([name]) => name === 'stage_exited'),
    ).toHaveLength(1);
    expect(tracker.track).toHaveBeenCalledWith(
      'interview_finished',
      expect.objectContaining({ total_duration_ms: 125 }),
    );
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
