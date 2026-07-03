import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHistoryBackGuard } from '../useHistoryBackGuard';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useHistoryBackGuard', () => {
  it('pins the history: duplicate entry on mount, re-push on every pop', () => {
    const pushState = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});

    const { unmount } = renderHook(() => useHistoryBackGuard(true));
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledWith(null, '', window.location.href);

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushState).toHaveBeenCalledTimes(2);

    // After unmount the guard lets history navigation through again.
    unmount();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushState).toHaveBeenCalledTimes(2);
  });

  it('does nothing while inactive', () => {
    const pushState = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {});

    renderHook(() => useHistoryBackGuard(false));
    expect(pushState).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(pushState).not.toHaveBeenCalled();
  });
});
