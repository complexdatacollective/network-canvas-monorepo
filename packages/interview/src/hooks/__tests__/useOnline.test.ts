import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import useOnline from '../useOnline';

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnline', () => {
  it('reads the initial navigator.onLine value', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it('reacts to offline and online events', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
