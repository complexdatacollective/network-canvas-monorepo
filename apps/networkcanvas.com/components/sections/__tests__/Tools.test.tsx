import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import { webDestinations } from '~/lib/getStarted';
import { renderWithIntl } from '~/test/renderWithIntl';

import { Tools } from '../Tools';

vi.mock('~/components/ui/DeviceMockup', () => ({
  DeviceMockup: ({ variant }: { variant?: string }) => (
    <span>{variant} preview</span>
  ),
}));

vi.mock('~/components/ui/Reveal', () => ({
  Reveal: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

const apps = [
  {
    name: 'Architect',
    actionName: 'Open Architect',
    variant: 'architect',
    href: 'https://architect.networkcanvas.com/',
    accent: 'sea-green',
  },
  {
    name: 'Interviewer',
    actionName: 'Open Interviewer',
    variant: 'interviewer',
    href: 'https://interviewer.networkcanvas.com/',
    accent: 'neon-coral',
  },
  {
    name: 'Fresco',
    actionName: 'Try the Fresco Sandbox',
    variant: 'fresco',
    href: 'https://fresco-sandbox.networkcanvas.com/',
    accent: 'slate-blue',
  },
] as const;

const card = (name: string) => screen.getByRole('article', { name });

// The thread's nodes are decoration, hidden from the accessibility tree, so
// they are found by the anchor each sits on.
function threadNode(anchor: string) {
  return screen
    .getByRole('region', {
      name: 'A selection of tools to facilitate your research',
    })
    .querySelector(`[data-thread-anchor="${anchor}"] > [aria-hidden]`);
}

// The radius of a card's bloom: 0 while it is closed on its node, null while
// nothing clips it.
function bloomRadius(element: HTMLElement): number | null {
  const match = /^circle\(([\d.]+)px/.exec(element.style.clipPath);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/*
 * jsdom has no layout, so the thread's anchors are given positions here: the
 * thread reaches Architect inside the first screen, and Interviewer and Fresco
 * further down. The reading line sits at 70% of jsdom's 768px window, 537.6px
 * below the section's top until the page scrolls.
 */
const anchorY: Record<string, number> = {
  start: 0,
  architectIn: 200,
  architectOut: 500,
  interviewerIn: 1000,
  frescoIn: 1000,
  interviewerOut: 1500,
  frescoOut: 1500,
  end: 2000,
};

let scrolled = 0;

class MeasuringResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  disconnect() {}
  observe() {
    this.callback([], this);
  }
  unobserve() {}
}

function stubLayout() {
  scrolled = 0;
  vi.stubGlobal('ResizeObserver', MeasuringResizeObserver);
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(
    function offsetTop(this: HTMLElement) {
      return anchorY[this.dataset.threadAnchor ?? ''] ?? 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({
      x: 0,
      y: -scrolled,
      top: -scrolled,
      left: 0,
      right: 0,
      bottom: -scrolled,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    }),
  );
  // jsdom has no `document.scrollingElement`, which Motion's `useScroll`
  // tracks the page through, and never scrolls.
  Object.defineProperty(document, 'scrollingElement', {
    configurable: true,
    get: () => document.documentElement,
  });
  vi.spyOn(document.documentElement, 'scrollTop', 'get').mockImplementation(
    () => scrolled,
  );
}

function unstubLayout() {
  Reflect.deleteProperty(document, 'scrollingElement');
}

function scrollTo(offset: number) {
  scrolled = offset;
  act(() => {
    fireEvent.scroll(window);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Tools', () => {
  it('presents each app as a card that links to the live application', () => {
    renderWithIntl(<Tools />);

    expect(
      screen.getByRole('region', {
        name: 'A selection of tools to facilitate your research',
      }),
    ).toBeInTheDocument();

    for (const app of apps) {
      const panel = within(card(app.name));
      const actionLink = panel.getByRole('link', { name: app.actionName });
      const previewLink = panel.getByRole('link', {
        name: `${app.variant} preview`,
      });

      expect(
        panel.getByRole('heading', { level: 3, name: app.name }),
      ).toHaveClass(`text-${app.accent}`);
      expect(actionLink).toHaveAttribute('href', app.href);
      expect(actionLink).toHaveAttribute('target', '_blank');
      expect(actionLink).toHaveClass(`bg-${app.accent}`);
      expect(previewLink).toHaveAttribute('href', app.href);
      expect(previewLink).toHaveAttribute('target', '_blank');
      // The screenshot link stays in the tab order with a visible focus ring.
      expect(previewLink).not.toHaveAttribute('tabindex');
      expect(previewLink).toHaveClass('focusable');
    }

    const deployLink = within(card('Fresco')).getByRole('link', {
      name: 'Deploy Fresco',
    });
    expect(deployLink).toHaveAttribute(
      'href',
      webDestinations.frescoDeployment,
    );
    expect(deployLink).toHaveAttribute('target', '_blank');
    // Slate-blue text needs a white ground for WCAG AA in the dark theme,
    // where the surface is dark.
    expect(deployLink).toHaveClass('text-slate-blue', 'bg-white');
    expect(deployLink).not.toHaveClass('bg-surface');
  });

  it('renders translated tool copy in Spanish', () => {
    renderWithIntl(<Tools />, 'es');

    expect(
      screen.getByRole('heading', {
        name: 'Una selección de herramientas para facilitar tu investigación',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir Architect' }),
    ).toHaveAttribute('href', 'https://architect.networkcanvas.com/');
    expect(
      screen.getByText(/especialistas en la materia se concentren/),
    ).toBeInTheDocument();
  });

  it('shows every card whole until the thread has been measured', () => {
    renderWithIntl(<Tools />);

    for (const app of apps) {
      expect(bloomRadius(card(app.name))).toBeNull();
    }
  });

  describe('as the thread is scrolled through', () => {
    beforeEach(stubLayout);
    afterEach(unstubLayout);

    it('opens each card as the thread runs past it, and closes it again on the way back', async () => {
      renderWithIntl(<Tools />);

      await waitFor(() => {
        expect(bloomRadius(card('Interviewer'))).toBe(0);
      });
      expect(bloomRadius(card('Fresco'))).toBe(0);
      await waitFor(() => {
        expect(bloomRadius(card('Architect'))).toBeGreaterThan(0);
      });

      // The reading line passes the fork's nodes at 1000px, and the cards
      // open over the next 35% of the window (268.8px): part way open here.
      scrollTo(600);
      await waitFor(() => {
        expect(bloomRadius(card('Interviewer'))).toBeGreaterThan(0);
      });
      expect(threadNode('interviewerIn')).toHaveAttribute('data-reached');
      expect(bloomRadius(card('Fresco'))).toBeGreaterThan(0);
      const partlyOpen = bloomRadius(card('Interviewer')) ?? 0;

      // Further down they open wider.
      scrollTo(800);
      await waitFor(() => {
        expect(bloomRadius(card('Interviewer'))).toBeGreaterThan(partlyOpen);
      });

      // Back up the page the thread withdraws from the fork's nodes and the
      // cards close back onto them.
      scrollTo(0);
      await waitFor(() => {
        expect(threadNode('interviewerIn')).not.toHaveAttribute('data-reached');
      });
      await waitFor(() => {
        expect(bloomRadius(card('Interviewer'))).toBe(0);
      });
      expect(bloomRadius(card('Fresco'))).toBe(0);
      expect(threadNode('architectIn')).toHaveAttribute('data-reached');
      expect(bloomRadius(card('Architect'))).toBeGreaterThan(0);
    });

    it('opens a card the thread has not reached when focus moves into it', async () => {
      renderWithIntl(<Tools />);

      await waitFor(() => {
        expect(bloomRadius(card('Interviewer'))).toBe(0);
      });

      act(() => {
        within(card('Interviewer'))
          .getByRole('link', { name: 'Open Interviewer' })
          .focus();
      });

      await waitFor(() => {
        expect(bloomRadius(card('Interviewer'))).toBeGreaterThan(0);
      });
      expect(bloomRadius(card('Fresco'))).toBe(0);
    });

    it('never clips a card when the visitor prefers reduced motion', async () => {
      renderWithIntl(
        <AnimationProvider reducedMotion="always">
          <Tools />
        </AnimationProvider>,
      );

      // The thread is drawn once its anchors have been measured; under reduced
      // motion that must still leave every card unclipped.
      const section = screen.getByRole('region', {
        name: 'A selection of tools to facilitate your research',
      });
      await waitFor(() => {
        expect(section.querySelectorAll('path').length).toBeGreaterThan(0);
      });
      for (const app of apps) {
        expect(bloomRadius(card(app.name))).toBeNull();
      }
    });
  });
});
