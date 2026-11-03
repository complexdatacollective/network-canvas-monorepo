import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from './AnimationProvider';
import {
  isPageActive,
  subscribeToPageActivity,
  usePageActive,
} from './pageActivity';

// One emulated window: whether the document is visible and whether the window
// has focus. Changes dispatch the events a browser would.
let visibility: DocumentVisibilityState = 'visible';
let focused = true;

beforeEach(() => {
  visibility = 'visible';
  focused = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The blur check waits a task, as it does in a browser, so the helpers do too.
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

async function emulateWindow(next: { visible?: boolean; focused?: boolean }) {
  await act(async () => {
    if (next.visible !== undefined) {
      visibility = next.visible ? 'visible' : 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    }
    if (next.focused !== undefined) {
      focused = next.focused;
      window.dispatchEvent(new Event(next.focused ? 'focus' : 'blur'));
    }
    await nextTask();
  });
}

describe('isPageActive', () => {
  it('is true for a visible, focused page', () => {
    expect(isPageActive()).toBe(true);
  });

  it('is false for a hidden page', () => {
    visibility = 'hidden';
    expect(isPageActive()).toBe(false);
  });

  it('is false for a visible page whose window is not focused', () => {
    focused = false;
    expect(isPageActive()).toBe(false);
  });

  it('ignores focus inside a frame, whose page decides', () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    focused = false;
    expect(isPageActive()).toBe(true);

    visibility = 'hidden';
    expect(isPageActive()).toBe(false);
  });
});

describe('subscribeToPageActivity', () => {
  it('reports each change once', async () => {
    const changes: boolean[] = [];
    const unsubscribe = subscribeToPageActivity((active) =>
      changes.push(active),
    );

    await emulateWindow({ focused: false });
    // Still inactive: hiding the page changes nothing the caller sees.
    await emulateWindow({ visible: false });
    await emulateWindow({ visible: true });
    await emulateWindow({ focused: true });
    unsubscribe();
    await emulateWindow({ focused: false });

    expect(changes).toEqual([false, true]);
  });

  it('does not report a blur that leaves the page focused', async () => {
    // Focus moving into a frame on the page blurs the window, but the page as
    // a whole keeps focus.
    const changes: boolean[] = [];
    const unsubscribe = subscribeToPageActivity((active) =>
      changes.push(active),
    );

    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await nextTask();
    });
    unsubscribe();

    expect(changes).toEqual([]);
  });
});

describe('usePageActive', () => {
  it('follows the page', async () => {
    const { result } = renderHook(() => usePageActive());
    expect(result.current).toBe(true);

    await emulateWindow({ focused: false });
    expect(result.current).toBe(false);

    await emulateWindow({ focused: true, visible: false });
    expect(result.current).toBe(false);

    await emulateWindow({ visible: true });
    expect(result.current).toBe(true);
  });
});

describe('AnimationProvider pausing endless animations', () => {
  type StubAnimation = {
    playState: AnimationPlayState;
    effect: { getComputedTiming: () => { endTime: number } };
    pause: () => void;
    play: () => void;
  };

  let animations: StubAnimation[];

  function stubAnimation(
    endTime: number,
    playState: AnimationPlayState = 'running',
  ): StubAnimation {
    const animation: StubAnimation = {
      playState,
      effect: { getComputedTiming: () => ({ endTime }) },
      pause: vi.fn(() => {
        animation.playState = 'paused';
      }),
      play: vi.fn(() => {
        animation.playState = 'running';
      }),
    };
    animations.push(animation);
    return animation;
  }

  beforeEach(() => {
    animations = [];
    // jsdom implements no Web Animations API.
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => animations as unknown as Animation[],
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'getAnimations');
  });

  it('pauses only endless animations while the page is inactive, and resumes them', async () => {
    const endless = stubAnimation(Infinity);
    const finite = stubAnimation(400);
    render(<AnimationProvider>content</AnimationProvider>);

    await emulateWindow({ focused: false });
    expect(endless.playState).toBe('paused');
    expect(finite.playState).toBe('running');

    await emulateWindow({ focused: true });
    expect(endless.playState).toBe('running');
    expect(finite.pause).not.toHaveBeenCalled();
  });

  it('leaves an animation paused by someone else paused', async () => {
    const pausedElsewhere = stubAnimation(Infinity, 'paused');
    render(<AnimationProvider>content</AnimationProvider>);

    await emulateWindow({ visible: false });
    await emulateWindow({ visible: true });

    expect(pausedElsewhere.play).not.toHaveBeenCalled();
    expect(pausedElsewhere.playState).toBe('paused');
  });

  it('pauses at mount on an inactive page', () => {
    focused = false;
    const endless = stubAnimation(Infinity);
    render(<AnimationProvider>content</AnimationProvider>);

    expect(endless.playState).toBe('paused');
  });

  it('pauses an animation that starts while the page is inactive', async () => {
    render(<AnimationProvider>content</AnimationProvider>);
    await emulateWindow({ focused: false });

    const lateStarter = stubAnimation(Infinity);
    act(() => {
      document.dispatchEvent(new Event('animationstart'));
    });

    expect(lateStarter.playState).toBe('paused');
  });

  it('pauses once per document, however many providers are nested', async () => {
    const endless = stubAnimation(Infinity);
    render(
      <AnimationProvider>
        <AnimationProvider>content</AnimationProvider>
      </AnimationProvider>,
    );

    await emulateWindow({ focused: false });

    expect(endless.pause).toHaveBeenCalledTimes(1);
  });

  it('resumes what it paused when it unmounts', async () => {
    const endless = stubAnimation(Infinity);
    const { unmount } = render(<AnimationProvider>content</AnimationProvider>);

    await emulateWindow({ focused: false });
    unmount();

    expect(endless.playState).toBe('running');
  });
});
