import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StageMetadataContext } from '../../contexts/StageMetadataContext';
import type { BeforeNextFunction, RegisterBeforeNext } from '../../types';
import useCompletePlacement from '../useCompletePlacement';

const showToast = vi.fn(() => 'toast');
const updateReady = vi.fn();
const track = vi.fn();

vi.mock('../../toast/useInterviewToast', () => ({
  useInterviewToast: () => ({ showToast, closeToast: vi.fn() }),
}));

vi.mock('../useReadyForNextStage', () => ({
  default: () => ({ updateReady }),
}));

vi.mock('../../analytics/useTrack', () => ({
  useTrack: () => track,
}));

vi.mock('../../localization/ProtocolLocalizationProvider', () => ({
  useResolveLocalizedString: () => (value: { en: string }) => ({
    text: value.en,
  }),
}));

const NOTICE = { en: 'Place everyone first.' };

function renderGate(options: {
  unplacedCount: number;
  required: boolean | undefined;
}) {
  let handler: BeforeNextFunction | null = null;
  const register = ((key: unknown, fn?: BeforeNextFunction | null) => {
    if (key === 'stageValidation') handler = fn ?? null;
  }) as RegisterBeforeNext;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StageMetadataContext.Provider value={register}>
      {children}
    </StageMetadataContext.Provider>
  );
  renderHook(() => useCompletePlacement({ ...options, notice: NOTICE }), {
    wrapper,
  });
  return (direction: 'forwards' | 'backwards') => handler?.(direction, 'step');
}

describe('useCompletePlacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the participant on the prompt while a node is unplaced', () => {
    const next = renderGate({ unplacedCount: 2, required: true });

    expect(next('forwards')).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Place everyone first.',
        variant: 'destructive',
        anchor: 'forward',
      }),
    );
    expect(track).toHaveBeenCalledWith('stage_validation_failed', {
      validation_kind: 'unplaced_nodes',
      direction: 'forwards',
    });
  });

  it('lets the participant go back with nodes unplaced', () => {
    const next = renderGate({ unplacedCount: 2, required: true });

    expect(next('backwards')).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('lets the participant continue once every node is placed', () => {
    const next = renderGate({ unplacedCount: 0, required: true });

    expect(next('forwards')).toBe(true);
    expect(updateReady).toHaveBeenLastCalledWith(true);
  });

  it.each([false, undefined])(
    'never blocks when the gate is %s',
    (required) => {
      const next = renderGate({ unplacedCount: 3, required });

      expect(next('forwards')).toBe(true);
      expect(showToast).not.toHaveBeenCalled();
      expect(updateReady).toHaveBeenLastCalledWith(false);
    },
  );
});
