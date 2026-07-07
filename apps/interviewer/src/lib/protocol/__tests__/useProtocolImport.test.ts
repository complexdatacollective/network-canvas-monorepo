import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProtocolImport } from '../useProtocolImport';

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: vi.fn() }),
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

describe('useProtocolImport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
