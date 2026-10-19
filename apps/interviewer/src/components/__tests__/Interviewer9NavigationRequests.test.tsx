import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import { Interviewer9NavigationRequests } from '../Interviewer9NavigationRequests';

const { navigation } = vi.hoisted(() => ({
  navigation: {
    pending: null as string | null,
    listeners: new Set<() => void>(),
  },
}));

vi.mock('~/lib/handoff/interviewer9Handoff', () => ({
  subscribeInterviewer9Navigation: (listener: () => void) => {
    navigation.listeners.add(listener);
    return () => navigation.listeners.delete(listener);
  },
  getInterviewer9Navigation: () => navigation.pending,
  takeInterviewer9Navigation: () => {
    const url = navigation.pending;
    navigation.pending = null;
    return url;
  },
}));
vi.mock('~/lib/handoff/interviewer9Navigation', () => ({
  leaveForInterviewer9: vi.fn(),
}));

import { leaveForInterviewer9 } from '~/lib/handoff/interviewer9Navigation';

const request = (url: string) => {
  act(() => {
    navigation.pending = url;
    for (const listener of navigation.listeners) listener();
  });
};

const renderAt = (path: string) => {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <Interviewer9NavigationRequests />
    </Router>,
  );
  return location;
};

afterEach(() => {
  navigation.pending = null;
  navigation.listeners.clear();
  vi.mocked(leaveForInterviewer9).mockClear();
});

describe('Interviewer9NavigationRequests', () => {
  it('leaves for a requested Interviewer 9 address away from an interview', () => {
    renderAt('/');

    request('/?import=k1');

    expect(leaveForInterviewer9).toHaveBeenCalledExactlyOnceWith('/?import=k1');
    expect(navigation.pending).toBeNull();
  });

  it('waits until the interview on screen has been left', () => {
    const location = renderAt('/interview/s1');

    request('/?import=k1');
    expect(leaveForInterviewer9).not.toHaveBeenCalled();

    act(() => {
      location.navigate('/');
    });
    expect(leaveForInterviewer9).toHaveBeenCalledExactlyOnceWith('/?import=k1');
  });

  it('acts on a request made before it mounted', () => {
    navigation.pending = '/?import=early';

    renderAt('/data');

    expect(leaveForInterviewer9).toHaveBeenCalledExactlyOnceWith(
      '/?import=early',
    );
  });
});
