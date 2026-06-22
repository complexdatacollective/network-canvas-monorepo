import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CurrentStepProvider, useCurrentStep } from '../CurrentStepContext';

describe('CurrentStepProvider', () => {
  it('forwards the step and progress meta to onStepChange in controlled mode', () => {
    const onStepChange = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CurrentStepProvider currentStep={0} onStepChange={onStepChange}>
        {children}
      </CurrentStepProvider>
    );
    const { result } = renderHook(() => useCurrentStep(), { wrapper });

    act(() => {
      result.current.setCurrentStep(2, { progress: 100, totalSteps: 6 });
    });

    expect(onStepChange).toHaveBeenCalledWith(2, {
      progress: 100,
      totalSteps: 6,
    });
  });

  it('updates the internal step in uncontrolled mode, ignoring the meta', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CurrentStepProvider>{children}</CurrentStepProvider>
    );
    const { result } = renderHook(() => useCurrentStep(), { wrapper });

    act(() => {
      result.current.setCurrentStep(3, { progress: 50, totalSteps: 6 });
    });

    expect(result.current.currentStep).toBe(3);
  });
});
