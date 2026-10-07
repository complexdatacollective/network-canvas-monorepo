import { afterEach, describe, expect, it, vi } from 'vitest';

import { pageHolderId } from '../holder.ts';

class NavigationEntry {
  readonly type: string;

  constructor(type: string) {
    this.type = type;
  }
}

const arrivedBy = (type: string) => {
  vi.stubGlobal('PerformanceNavigationTiming', NavigationEntry);
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    new NavigationEntry(type) as unknown as PerformanceEntry,
  ]);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('the page’s holder id', () => {
  it('is the same after a reload, so the page keeps its own session', () => {
    arrivedBy('navigate');
    const first = pageHolderId();
    arrivedBy('reload');

    expect(pageHolderId()).toBe(first);
  });

  it('is new for any other arrival, so a duplicated tab takes the session over', () => {
    arrivedBy('navigate');
    const first = pageHolderId();
    arrivedBy('back_forward');

    expect(pageHolderId()).not.toBe(first);
  });
});
