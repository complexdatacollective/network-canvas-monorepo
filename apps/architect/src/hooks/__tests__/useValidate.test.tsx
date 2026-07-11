import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import useValidate from '../useValidate';

describe('useValidate', () => {
  it('keeps a stable Redux Form validator while using the latest rules', () => {
    const { result, rerender } = renderHook(
      ({ required }: { required: boolean }) => useValidate({ required }),
      { initialProps: { required: true } },
    );
    const initialValidators = result.current;

    expect(result.current[0]?.('')).toBe('Required');

    rerender({ required: false });

    expect(result.current).toBe(initialValidators);
    expect(result.current[0]?.('')).toBeUndefined();
  });

  it('uses the latest validator closure after a rerender', () => {
    const firstValidator = vi.fn(() => 'First error');
    const secondValidator = vi.fn(() => 'Second error');
    const { result, rerender } = renderHook(
      ({ validator }) => useValidate({ validator }),
      { initialProps: { validator: firstValidator } },
    );

    expect(result.current[0]?.('value')).toBe('First error');

    rerender({ validator: secondValidator });

    expect(result.current[0]?.('value')).toBe('Second error');
    expect(firstValidator).toHaveBeenCalledOnce();
    expect(secondValidator).toHaveBeenCalledOnce();
  });
});
