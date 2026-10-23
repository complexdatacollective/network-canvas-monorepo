import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import usePrevious from '../usePrevious';

describe('usePrevious', () => {
  it('reports nothing until the value has changed', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 1 },
    });
    expect(result.current).toBeUndefined();

    rerender({ value: 1 });
    expect(result.current).toBeUndefined();
  });

  it('reports the value held before the last change, in the render that sees it', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current).toBe('a');

    rerender({ value: 'c' });
    expect(result.current).toBe('b');
  });

  it('keeps reporting the same previous value across re-renders that change nothing', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    rerender({ value: 'b' });
    rerender({ value: 'b' });
    expect(result.current).toBe('a');
  });
});
