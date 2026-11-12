import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { headingMargin, SectionHeading } from '../SectionHeading';

const title = 'A selection of tools to facilitate your research';

// jsdom has no layout, so visibility is reported by hand: `see` fires the
// observer the heading registered, as the title enters or leaves the screen.
const observers: ObservingStub[] = [];

class ObservingStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin: string;
  readonly scrollMargin = '';
  readonly thresholds = [];
  readonly targets: Element[] = [];
  private readonly callback: IntersectionObserverCallback;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '';
    observers.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }

  report(isIntersecting: boolean, top: number) {
    const rect = DOMRect.fromRect({ x: 0, y: top, width: 600, height: 80 });
    this.callback(
      this.targets.map(
        (target) =>
          ({
            target,
            isIntersecting,
            boundingClientRect: rect,
            intersectionRatio: isIntersecting ? 1 : 0,
            intersectionRect: rect,
            rootBounds: null,
            time: 0,
          }) satisfies IntersectionObserverEntry,
      ),
      this,
    );
  }
}

function see(isIntersecting: boolean, top = 300) {
  act(() => {
    for (const observer of observers) observer.report(isIntersecting, top);
  });
}

const words = () =>
  screen
    .getByRole('heading', { name: title })
    .querySelectorAll<HTMLElement>('[aria-hidden] > span > span');

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', ObservingStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SectionHeading', () => {
  it('names the heading with the whole title and shows it once, split into words', () => {
    render(<SectionHeading title={title}>Introduction</SectionHeading>);

    const heading = screen.getByRole('heading', { level: 2, name: title });
    // One visible copy of the title, with the spaces kept between words so it
    // still wraps.
    expect(heading).toHaveTextContent(title, { normalizeWhitespace: false });
    expect(words()).toHaveLength(8);
  });

  it('holds the words below their masks until the title is seen', () => {
    render(<SectionHeading title={title}>Introduction</SectionHeading>);

    for (const word of words()) {
      expect(word.style.opacity).toBe('0');
      expect(word.style.transform).toContain('translateY(1.25em)');
    }
    expect(screen.getByText('Introduction').style.opacity).toBe('0');
  });

  it('plays the entrance when the title comes into view, and then stays', async () => {
    render(<SectionHeading title={title}>Introduction</SectionHeading>);

    see(true);
    await waitFor(() => {
      for (const word of words()) expect(word.style.opacity).toBe('1');
    });
    expect(screen.getByText('Introduction').style.opacity).toBe('1');

    // Scrolled past, and back up past it: the title stays where it landed.
    see(false, -200);
    see(false, 900);
    for (const word of words()) {
      expect(word.style.opacity).toBe('1');
      expect(word.style.transform).not.toContain('translateY');
    }
    expect(screen.getByText('Introduction').style.opacity).toBe('1');
  });

  it('insets where a title is seen by a share of the screen height, in px', () => {
    // Observer margins in percent resolve against the screen's width, which
    // on a wide, short window can leave no area to be seen in.
    expect(headingMargin(400)).toBe('-48px 0px -48px 0px');
    render(<SectionHeading title={title}>Introduction</SectionHeading>);
    expect(observers.at(-1)?.rootMargin).toBe(
      headingMargin(window.innerHeight),
    );
  });
});
