import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProtocolImport } from '../useProtocolImport';

const { dialogOpen, toastAdd } = vi.hoisted(() => ({
  dialogOpen: vi.fn(),
  toastAdd: vi.fn(),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: dialogOpen, closeDialog: vi.fn() }),
}));
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));
vi.mock('~/lib/db/api', () => ({
  updateSettings: vi.fn(),
}));
vi.mock('../importProtocol', () => ({
  importProtocolFromFile: vi.fn(() => new Promise(() => {})),
  peekProtocolName: vi.fn(async () => null),
}));

import { importProtocolFromFile } from '../importProtocol';

type ToastCall = {
  cancelLabel?: string;
  onCancel?: () => void;
};

describe('useProtocolImport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(importProtocolFromFile).mockImplementation(
      () => new Promise(() => {}),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows the pending card immediately but delays the import work', async () => {
    const { result } = renderHook(() =>
      useProtocolImport({ onInstalled: () => {} }),
    );

    await act(async () => {
      await result.current.startImport({
        source: 'file',
        file: new File([new Uint8Array()], 'study.netcanvas'),
        label: 'study.netcanvas',
      });
    });

    expect(result.current.pendingImports).toHaveLength(1);
    expect(importProtocolFromFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(importProtocolFromFile).toHaveBeenCalledTimes(1);
  });

  it('adds a details action to validation failure toasts', async () => {
    vi.mocked(importProtocolFromFile).mockResolvedValueOnce({
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
      issues: [
        {
          path: 'stages.0.label',
          message: 'Required',
        },
      ],
    });

    const { result } = renderHook(() =>
      useProtocolImport({ onInstalled: () => {} }),
    );

    await act(async () => {
      await result.current.startImport({
        source: 'file',
        file: new File([new Uint8Array()], 'study.netcanvas'),
        label: 'study.netcanvas',
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Import failed',
        description: 'Protocol failed schema validation.',
        variant: 'destructive',
        cancelLabel: 'View details',
      }),
    );

    const toastCall = toastAdd.mock.calls[0]?.[0] as ToastCall | undefined;
    expect(toastCall?.onCancel).toEqual(expect.any(Function));

    toastCall?.onCancel?.();

    expect(dialogOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'custom',
        title: 'Protocol validation failed',
        description: 'Details of the validation errors can be found below:',
        intent: 'destructive',
      }),
    );
  });
});
