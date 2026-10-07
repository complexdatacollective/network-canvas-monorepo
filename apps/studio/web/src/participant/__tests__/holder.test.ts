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
  window.name = '';
});

const deniedStorage = () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
};

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

  it('is the same after a reload where the browser denies sessionStorage', () => {
    deniedStorage();
    arrivedBy('navigate');
    const first = pageHolderId();
    arrivedBy('reload');

    expect(pageHolderId()).toBe(first);
  });

  it('is new for any other arrival where the browser denies sessionStorage', () => {
    deniedStorage();
    arrivedBy('navigate');
    const first = pageHolderId();
    arrivedBy('back_forward');

    expect(pageHolderId()).not.toBe(first);
  });

  it('leaves a window name the page did not set alone', () => {
    window.name = 'someone-else';
    arrivedBy('navigate');
    pageHolderId();

    expect(window.name).toBe('someone-else');
  });
});
