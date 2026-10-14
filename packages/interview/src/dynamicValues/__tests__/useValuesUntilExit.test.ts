import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useValuesUntilExit } from '../useValuesUntilExit';

describe('useValuesUntilExit', () => {
  it('keeps the outgoing values until the exit completes', () => {
    const { result, rerender } = renderHook(
      ({ key, values }) => useValuesUntilExit(key, values),
      { initialProps: { key: 'a', values: { name: 'Ada' } } },
    );
    expect(result.current.values).toEqual({ name: 'Ada' });

    rerender({ key: 'b', values: { name: 'Bo' } });
    expect(result.current.values).toEqual({ name: 'Ada' });

    act(() => result.current.onExitComplete());
    expect(result.current.values).toEqual({ name: 'Bo' });
  });

  it('follows new values for the same key at once', () => {
    const { result, rerender } = renderHook(
      ({ key, values }) => useValuesUntilExit(key, values),
      {
        initialProps: {
          key: 'a',
          values: { name: undefined as string | undefined },
        },
      },
    );
    rerender({ key: 'a', values: { name: 'Ada' } });
    expect(result.current.values).toEqual({ name: 'Ada' });
  });
});
