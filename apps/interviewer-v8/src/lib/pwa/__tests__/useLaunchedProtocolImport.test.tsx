import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSubscribe, mockGet, mockTake, EMPTY } = vi.hoisted(() => {
  // Stable empty snapshot: useSyncExternalStore requires getSnapshot to
  // return a cached value, like the real store does.
  const stableEmpty: File[] = [];
  return {
    EMPTY: stableEmpty,
    mockSubscribe: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    mockGet: vi.fn<() => File[]>(() => stableEmpty),
    mockTake: vi.fn<() => File[]>(() => stableEmpty),
  };
});

vi.mock('../fileLaunchQueue', () => ({
  subscribeLaunchFiles: mockSubscribe,
  getLaunchFiles: mockGet,
  takeLaunchFiles: mockTake,
}));

import { useLaunchedProtocolImport } from '../useLaunchedProtocolImport';

afterEach(() => {
  vi.clearAllMocks();
  mockGet.mockReturnValue(EMPTY);
  mockTake.mockReturnValue(EMPTY);
});

describe('useLaunchedProtocolImport', () => {
  it('does nothing while no launched files are pending', () => {
    const startImport = vi.fn(() => Promise.resolve());
    renderHook(() => useLaunchedProtocolImport(startImport));
    expect(startImport).not.toHaveBeenCalled();
    expect(mockTake).not.toHaveBeenCalled();
  });

  it('imports each launched file through the pipeline, sequentially', async () => {
    const a = new File(['a'], 'a.netcanvas');
    const b = new File(['b'], 'b.netcanvas');
    mockGet.mockReturnValue([a, b]);
    mockTake.mockReturnValue([a, b]);
    const startImport = vi.fn(() => Promise.resolve());

    renderHook(() => useLaunchedProtocolImport(startImport));

    await waitFor(() => expect(startImport).toHaveBeenCalledTimes(2));
    expect(startImport).toHaveBeenNthCalledWith(1, {
      source: 'file',
      file: a,
      label: 'a.netcanvas',
    });
    expect(startImport).toHaveBeenNthCalledWith(2, {
      source: 'file',
      file: b,
      label: 'b.netcanvas',
    });
  });

  it('reacts to files arriving after mount via the store subscription', async () => {
    let notify: (() => void) | undefined;
    mockSubscribe.mockImplementation((listener: () => void) => {
      notify = listener;
      return () => {};
    });
    const startImport = vi.fn(() => Promise.resolve());
    renderHook(() => useLaunchedProtocolImport(startImport));
    expect(startImport).not.toHaveBeenCalled();

    const late = new File(['x'], 'late.netcanvas');
    mockGet.mockReturnValue([late]);
    mockTake.mockReturnValue([late]);
    act(() => notify?.());

    await waitFor(() => expect(startImport).toHaveBeenCalledTimes(1));
    expect(startImport).toHaveBeenCalledWith({
      source: 'file',
      file: late,
      label: 'late.netcanvas',
    });
  });
});
