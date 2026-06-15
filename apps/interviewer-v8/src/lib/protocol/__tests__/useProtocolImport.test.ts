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
  importProtocolFromFile: vi.fn(),
  importProtocolFromUrl: vi.fn(
    () => new Promise(() => {}), // never resolves; only the start matters here
  ),
  peekProtocolName: vi.fn(),
}));

import { importProtocolFromUrl } from '../importProtocol';

describe('useProtocolImport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows the pending card immediately but delays the import work so the deck can travel first', async () => {
    const { result } = renderHook(() =>
      useProtocolImport({ onInstalled: () => {} }),
    );

    await act(async () => {
      await result.current.startImport({
        source: 'url',
        url: 'https://example.com/study.netcanvas',
        label: 'study.netcanvas',
      });
    });

    // The pending entry (and with it the card) exists right away…
    expect(result.current.pendingImports).toHaveLength(1);
    // …but the heavy import work has not started yet.
    expect(importProtocolFromUrl).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(importProtocolFromUrl).toHaveBeenCalledTimes(1);
  });
});
