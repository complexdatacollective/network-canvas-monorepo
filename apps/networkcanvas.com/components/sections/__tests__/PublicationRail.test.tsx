import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { Publication } from '~/lib/siteContent';

import { PublicationRail } from '../PublicationRail';

type ScrollProgressHandler = (progress: number) => void;

const motionState = vi.hoisted<{
  progress: number;
  reducedMotion: boolean | null;
  scrollHandler: ScrollProgressHandler | undefined;
}>(() => ({
  progress: 0,
  reducedMotion: false,
  scrollHandler: undefined,
}));

vi.mock('motion/react', () => ({
  useMotionValueEvent: (
    _value: unknown,
    _event: string,
    handler: ScrollProgressHandler,
  ) => {
    motionState.scrollHandler = handler;
  },
  useReducedMotion: () => motionState.reducedMotion,
  useScroll: () => ({
    scrollYProgress: {
      get: () => motionState.progress,
    },
  }),
}));

const publications: Publication[] = [
  {
    id: 'first',
    title: 'First publication',
    source: 'Journal One',
    authors: 'Researcher One',
    href: 'https://example.com/first',
  },
  {
    id: 'second',
    title: 'Second publication',
    source: 'Journal Two',
    authors: 'Researcher Two',
    href: 'https://example.com/second',
  },
  {
    id: 'third',
    title: 'Third publication',
    source: 'Journal Three',
    authors: 'Researcher Three',
    href: 'https://example.com/third',
  },
];

const originalScrollWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollWidth',
);
const originalClientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth',
);
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollHeight',
);
const originalInnerHeight = Object.getOwnPropertyDescriptor(
  window,
  'innerHeight',
);
let contentScrollHeight = 600;
let viewportScrollWidth = 1800;
let pinnedViewportMatches = true;
const mediaQueryListeners = new Set<() => void>();

function createRail(entries: readonly Publication[] = publications) {
  return (
    <PublicationRail
      headingId="recent-publications-heading"
      publications={entries}
      railLabel="Recent publications carousel"
    >
      <div>
        <h2 id="recent-publications-heading">Recent publications</h2>
        <p>Eight recent publications using Network Canvas.</p>
      </div>
    </PublicationRail>
  );
}

function renderRail(entries: readonly Publication[] = publications) {
  return render(createRail(entries));
}

function setPinnedViewportMatches(matches: boolean) {
  pinnedViewportMatches = matches;
  mediaQueryListeners.forEach((listener) => listener());
}

describe('PublicationRail', () => {
  beforeEach(() => {
    motionState.progress = 0;
    motionState.reducedMotion = false;
    motionState.scrollHandler = undefined;
    contentScrollHeight = 600;
    viewportScrollWidth = 1800;
    pinnedViewportMatches = true;
    mediaQueryListeners.clear();

    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'publication-rail-viewport'
          ? viewportScrollWidth
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'publication-rail-viewport'
          ? 1000
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'publication-rail-content'
          ? contentScrollHeight
          : 0;
      },
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => {
        const isPinnedRailQuery =
          query === '(min-width: 768px) and (min-height: 640px)';

        return {
          get matches() {
            return isPinnedRailQuery && pinnedViewportMatches;
          },
          media: query,
          onchange: null,
          addEventListener: (_event: string, listener: () => void) => {
            mediaQueryListeners.add(listener);
          },
          removeEventListener: (_event: string, listener: () => void) => {
            mediaQueryListeners.delete(listener);
          },
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
      }),
    });
  });

  afterEach(cleanup);

  afterAll(() => {
    if (originalScrollWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollWidth',
        originalScrollWidth,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    }

    if (originalClientWidth) {
      Object.defineProperty(
        HTMLElement.prototype,
        'clientWidth',
        originalClientWidth,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }

    if (originalScrollHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollHeight',
        originalScrollHeight,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
    }

    if (originalInnerHeight) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    } else {
      Reflect.deleteProperty(window, 'innerHeight');
    }
  });

  it('pins the copy while one full-width row follows page scroll', async () => {
    motionState.progress = 0.25;
    renderRail();

    const section = screen.getByRole('region', {
      name: 'Recent publications',
    });
    const stage = screen.getByTestId('publication-rail-stage');
    const viewport = screen.getByTestId('publication-rail-viewport');
    const track = screen.getByRole('list');
    const heading = screen.getByRole('heading', {
      name: 'Recent publications',
    });

    await waitFor(() => {
      expect(section).toHaveAttribute('data-publication-rail-mode', 'pinned');
    });

    expect(section).toHaveStyle({
      height: 'calc(100svh + 800px)',
    });
    expect(stage).toHaveClass('sticky', 'top-0', 'h-svh');
    expect(viewport).toHaveAccessibleName('Recent publications carousel');
    expect(viewport).toHaveClass('overflow-x-hidden');
    expect(viewport).toHaveAttribute('tabindex', '-1');
    expect(track).toHaveClass('flex', 'w-max', 'items-stretch');
    expect(track).not.toContainElement(heading);
    expect(withinTrackLinks(track)).toHaveLength(publications.length);
    expect(viewport.scrollLeft).toBe(200);

    act(() => motionState.scrollHandler?.(0.75));

    expect(viewport.scrollLeft).toBe(600);
  });

  it('keeps a native horizontal row without pinning for reduced motion', async () => {
    motionState.reducedMotion = true;
    renderRail();

    const section = screen.getByRole('region', {
      name: 'Recent publications',
    });
    const stage = screen.getByTestId('publication-rail-stage');
    const viewport = screen.getByTestId('publication-rail-viewport');
    const track = screen.getByRole('list');

    await waitFor(() => {
      expect(track).toContainElement(
        screen.getByRole('link', { name: /First publication/ }),
      );
    });

    expect(section).toHaveAttribute('data-publication-rail-mode', 'scrollable');
    expect(section).not.toHaveAttribute('style');
    expect(stage).not.toHaveClass('sticky', 'h-svh');
    expect(viewport).toHaveClass('overflow-x-auto', 'snap-x', 'snap-proximity');
    expect(viewport).toHaveAttribute('tabindex', '0');

    act(() => motionState.scrollHandler?.(0.75));

    expect(viewport.scrollLeft).toBe(0);
  });

  it('keeps the native fallback when the content cannot fit in the viewport', async () => {
    contentScrollHeight = 800;
    renderRail();

    const section = screen.getByRole('region', {
      name: 'Recent publications',
    });
    const viewport = screen.getByTestId('publication-rail-viewport');

    await waitFor(() => {
      expect(section).toHaveAttribute(
        'data-publication-rail-mode',
        'scrollable',
      );
    });

    expect(section).not.toHaveAttribute('style');
    expect(viewport).toHaveClass('overflow-x-auto');
    expect(viewport).toHaveAttribute('tabindex', '0');
  });

  it('resets the pinned position once when changing to the native fallback', async () => {
    motionState.progress = 0.5;
    const { rerender } = renderRail();
    const section = screen.getByRole('region', {
      name: 'Recent publications',
    });
    const viewport = screen.getByTestId('publication-rail-viewport');

    await waitFor(() => {
      expect(section).toHaveAttribute('data-publication-rail-mode', 'pinned');
    });
    expect(viewport.scrollLeft).toBe(400);

    act(() => setPinnedViewportMatches(false));

    await waitFor(() => {
      expect(section).toHaveAttribute(
        'data-publication-rail-mode',
        'scrollable',
      );
    });
    expect(viewport.scrollLeft).toBe(0);

    viewport.scrollLeft = 175;
    viewportScrollWidth = 1700;
    rerender(createRail(publications.slice(0, 2)));

    await waitFor(() => {
      expect(viewport.scrollLeft).toBe(175);
    });
  });

  it('hydrates the static fallback before activating scroll-linked motion', async () => {
    const serverMarkup = renderToString(createRail());
    const container = document.createElement('div');
    const recoverableError = vi.fn();
    container.innerHTML = serverMarkup;
    document.body.append(container);

    const root = hydrateRoot(container, createRail(), {
      onRecoverableError: recoverableError,
    });

    await act(async () => Promise.resolve());

    expect(recoverableError).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});

function withinTrackLinks(track: HTMLElement) {
  return Array.from(track.querySelectorAll('a'));
}
