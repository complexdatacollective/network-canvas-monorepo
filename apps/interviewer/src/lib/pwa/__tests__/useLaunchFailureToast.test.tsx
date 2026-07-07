import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockSubscribe, mockGet, mockTake, mockToast } = vi.hoisted(() => ({
  mockSubscribe: vi.fn<(listener: () => void) => () => void>(() => () => {}),
  mockGet: vi.fn<() => number>(() => 0),
  mockTake: vi.fn<() => number>(() => 0),
  mockToast: vi.fn(),
}));

vi.mock('../fileLaunchQueue', () => ({
  subscribeLaunchFiles: mockSubscribe,
  getLaunchFailureCount: mockGet,
  takeLaunchFailureCount: mockTake,
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { useLaunchFailureToast } from '../useLaunchFailureToast';

afterEach(() => {
  vi.clearAllMocks();
  mockGet.mockReturnValue(0);
  mockTake.mockReturnValue(0);
});

describe('useLaunchFailureToast', () => {
  it('does nothing while no failures are pending', () => {
    renderHook(() => useLaunchFailureToast());
    expect(mockTake).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('toasts a singular message for one pending failure', async () => {
    mockGet.mockReturnValue(1);
    mockTake.mockReturnValue(1);

    renderHook(() => useLaunchFailureToast());

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not open file',
        description: expect.stringContaining(
          '1 launched file could not be read',
        ),
        variant: 'destructive',
      }),
    );
  });

  it('toasts a plural message and reacts to failures arriving after mount', async () => {
    let notify: (() => void) | undefined;
    mockSubscribe.mockImplementation((listener: () => void) => {
      notify = listener;
      return () => {};
    });
    renderHook(() => useLaunchFailureToast());
    expect(mockToast).not.toHaveBeenCalled();

    mockGet.mockReturnValue(2);
    mockTake.mockReturnValue(2);
    act(() => notify?.());

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining(
          '2 launched files could not be read',
        ),
      }),
    );
  });
});
