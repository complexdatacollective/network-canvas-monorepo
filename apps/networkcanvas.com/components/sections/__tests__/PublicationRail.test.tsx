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
    year: '2024',
  },
  {
    id: 'second',
    title: 'Second publication',
    source: 'Journal Two',
    authors: 'Researcher Two',
    href: 'https://example.com/second',
    year: '2023',
  },
  {
    id: 'third',
    title: 'Third publication',
    source: 'Journal Three',
    authors: 'Researcher Three',
    href: 'https://example.com/third',
    year: '2022',
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
let viewportScrollWidth = 1800;
let flowingViewportMatches = true;
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

function setFlowingViewportMatches(matches: boolean) {
  flowingViewportMatches = matches;
  mediaQueryListeners.forEach((listener) => listener());
}

describe('PublicationRail', () => {
  beforeEach(() => {
    motionState.progress = 0;
    motionState.reducedMotion = false;
    motionState.scrollHandler = undefined;
    viewportScrollWidth = 1800;
    flowingViewportMatches = true;
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
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => {
        const isFlowingRailQuery =
          query === '(min-width: 768px) and (min-height: 640px)';

        return {
          get matches() {
            return isFlowingRailQuery && flowingViewportMatches;
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
  });

  it('advances the rail as page scroll changes, without discarding a manual scroll position', async () => {
    motionState.progress = 0.25;
    renderRail();

    const section = screen.getByRole('region', {
      name: 'Recent publications',
    });
    const viewport = screen.getByTestId('publication-rail-viewport');
    const track = screen.getByRole('list');
    const heading = screen.getByRole('heading', {
      name: 'Recent publications',
    });

    await waitFor(() => {
      expect(section).toHaveAttribute('data-publication-rail-mode', 'flowing');
    });

    expect(viewport).toHaveAccessibleName('Recent publications carousel');
    await waitFor(() => expect(viewport).toHaveAttribute('tabindex', '0'));
    expect(track).toHaveClass('grid', 'w-max', 'grid-flow-col', 'grid-rows-2');
    expect(track).not.toContainElement(heading);
    expect(withinTrackLinks(track)).toHaveLength(publications.length);

    // Mounting mid-scroll anchors the auto-advance baseline instead of
    // jumping the rail to match the page's current scroll progress.
    expect(viewport.scrollLeft).toBe(0);

    act(() => motionState.scrollHandler?.(0.75));
    expect(viewport.scrollLeft).toBe(400);

    // A manual scroll (trackpad, touch, scrollbar) composes with further
    // page-scroll-linked movement instead of being overwritten by it.
    viewport.scrollLeft = 550;
    act(() => motionState.scrollHandler?.(0.9));
    expect(viewport.scrollLeft).toBe(670);
  });

  it('shows each publication year as a machine-readable date', async () => {
    renderRail();

    const year = await screen.findByText('2024');

    expect(year.tagName).toBe('TIME');
    expect(year).toHaveAttribute('datetime', '2024');
    expect(year.closest('a')).toHaveTextContent('Journal One · 2024');
  });

  it('keeps a native horizontal grid without scroll-linked motion for reduced motion', async () => {
    motionState.reducedMotion = true;
    renderRail();

    const section = screen.getByRole('region', {
      name: 'Recent publications',
    });
    const viewport = screen.getByTestId('publication-rail-viewport');
    const track = screen.getByRole('list');

    await waitFor(() => {
      expect(track).toContainElement(
        screen.getByRole('link', { name: /First publication/ }),
      );
    });

    expect(section).toHaveAttribute('data-publication-rail-mode', 'scrollable');
    expect(viewport).toHaveClass('overflow-x-auto', 'snap-x', 'snap-proximity');
    await waitFor(() => expect(viewport).toHaveAttribute('tabindex', '0'));

    act(() => motionState.scrollHandler?.(0.75));
    expect(viewport.scrollLeft).toBe(0);
  });

  it('keeps the native fallback below the pinned-rail viewport breakpoint', async () => {
    flowingViewportMatches = false;
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

    expect(viewport).toHaveClass('overflow-x-auto');
    await waitFor(() => expect(viewport).toHaveAttribute('tabindex', '0'));
  });

  it('keeps the scroll position and stops auto-advancing once the native fallback engages', async () => {
    motionState.progress = 0.5;
    renderRail();
    const section = screen.getByRole('region', {
      name: 'Recent publications',
    });
    const viewport = screen.getByTestId('publication-rail-viewport');

    await waitFor(() => {
      expect(section).toHaveAttribute('data-publication-rail-mode', 'flowing');
    });

    act(() => motionState.scrollHandler?.(0.75));
    expect(viewport.scrollLeft).toBe(200);

    act(() => setFlowingViewportMatches(false));

    await waitFor(() => {
      expect(section).toHaveAttribute(
        'data-publication-rail-mode',
        'scrollable',
      );
    });
    expect(viewport.scrollLeft).toBe(200);

    act(() => motionState.scrollHandler?.(1));
    expect(viewport.scrollLeft).toBe(200);
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
