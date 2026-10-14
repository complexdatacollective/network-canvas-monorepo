import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DynamicValueEntities } from '../DynamicValueScope';
import { useValuesUntilExit } from '../useValuesUntilExit';

const named = (label: string | undefined): DynamicValueEntities => ({
  attributes: { node: { name: label } },
  labels: { node: label },
});

describe('useValuesUntilExit', () => {
  it('keeps the outgoing values until the exit completes', () => {
    const { result, rerender } = renderHook(
      ({ key, values }) => useValuesUntilExit(key, values),
      { initialProps: { key: 'a', values: named('Ada') } },
    );
    expect(result.current.values.labels).toEqual({ node: 'Ada' });

    rerender({ key: 'b', values: named('Bo') });
    expect(result.current.values.labels).toEqual({ node: 'Ada' });

    act(() => result.current.onExitComplete());
    expect(result.current.values.labels).toEqual({ node: 'Bo' });
  });

  it('names the first content at once when nothing was on screen', () => {
    // Nothing leaves, so no exit completes.
    const { result, rerender } = renderHook(
      ({ key, values }) => useValuesUntilExit(key, values),
      {
        initialProps: {
          key: undefined as string | undefined,
          values: named(undefined),
        },
      },
    );
    rerender({ key: 'a', values: named('Ada') });
    expect(result.current.values.labels).toEqual({ node: 'Ada' });

    rerender({ key: 'b', values: named('Bo') });
    expect(result.current.values.labels).toEqual({ node: 'Ada' });
  });

  it('follows new values for the same key at once', () => {
    const { result, rerender } = renderHook(
      ({ key, values }) => useValuesUntilExit(key, values),
      { initialProps: { key: 'a', values: named(undefined) } },
    );
    rerender({ key: 'a', values: named('Ada') });
    expect(result.current.values.labels).toEqual({ node: 'Ada' });
  });

  it('names the outgoing content as it was last shown', () => {
    // A label that decrypts after the content appears.
    const attributes = { node: { name: [1, 2, 3] } };
    const locked: DynamicValueEntities = { attributes, labels: { node: '🔒' } };
    const decrypted: DynamicValueEntities = {
      attributes,
      labels: { node: 'Ada' },
    };
    const { result, rerender } = renderHook(
      ({ key, values }) => useValuesUntilExit(key, values),
      { initialProps: { key: 'a', values: locked } },
    );
    rerender({ key: 'a', values: decrypted });

    rerender({ key: 'b', values: named('Bo') });
    expect(result.current.values.labels).toEqual({ node: 'Ada' });
  });

  it('settles when the values are new objects with the same content', () => {
    const attributes = { node: { name: 'Ada' } };
    const { result, rerender } = renderHook(
      ({ key, values }) => useValuesUntilExit(key, values),
      {
        initialProps: {
          key: 'a',
          values: { attributes: { ...attributes }, labels: { node: 'Ada' } },
        },
      },
    );
    // A caller builds its values afresh on every render.
    rerender({
      key: 'a',
      values: { attributes: { ...attributes }, labels: { node: 'Ada' } },
    });
    expect(result.current.values.labels).toEqual({ node: 'Ada' });
  });
});
