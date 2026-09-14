import { render, screen } from '@testing-library/react';
import { act, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSummaryFits } from '../CategoricalBinItem';

// jsdom does not lay anything out, so the three boxes the hook measures are
// driven directly. `summaryNeeds` is the only one that moves during a test: it
// stands for the summary's text changing as people arrive in or leave the bin.
// It is read off the text element, which keeps its natural height even while
// the bin is holding the box around it at zero.
const CONTENT_HEIGHT = 100;
const TITLE_HEIGHT = 74;
let summaryNeeds = 20;

type Observed = { element: Element; notify: () => void };
let observed: Observed[] = [];

class FakeResizeObserver {
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  observe(element: Element) {
    observed.push({ element, notify: () => act(() => this.callback()) });
  }

  disconnect() {
    observed = [];
  }

  unobserve() {}
}

function Probe() {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const fits = useSummaryFits(contentRef, titleRef, summaryRef, true);

  return (
    <div ref={contentRef} data-testid="content">
      <h4 ref={titleRef} data-testid="title">
        Family
      </h4>
      <p ref={summaryRef} data-testid="summary">
        Amy and 2 others
      </p>
      <output data-testid="fits">{String(fits)}</output>
    </div>
  );
}

const fits = () => screen.getByTestId('fits').textContent;

const defineMetric = (
  prototype: object,
  metric: string,
  get: (this: HTMLElement) => number,
) => {
  Object.defineProperty(prototype, metric, { configurable: true, get });
};

beforeEach(() => {
  observed = [];
  summaryNeeds = 20;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);

  defineMetric(HTMLElement.prototype, 'clientHeight', function (this) {
    return this.dataset.testid === 'content' ? CONTENT_HEIGHT : 0;
  });
  defineMetric(HTMLElement.prototype, 'offsetHeight', function (this) {
    if (this.dataset.testid === 'title') return TITLE_HEIGHT;
    return this.dataset.testid === 'summary' ? summaryNeeds : 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const metric of ['clientHeight', 'offsetHeight']) {
    Reflect.deleteProperty(HTMLElement.prototype, metric);
  }
});

describe('useSummaryFits', () => {
  it('watches the summary, not only the boxes around it', () => {
    render(<Probe />);
    const watched = observed.map(
      ({ element }) => (element as HTMLElement).dataset.testid,
    );
    expect(watched).toContain('summary');
  });

  it('stands the summary aside when its own text grows past the room left', () => {
    render(<Probe />);
    expect(fits()).toBe('true');

    // Another person joins the bin: "Amy and 2 others" becomes a name long
    // enough to wrap. Nothing else in the bin moves, so only the summary's own
    // resize can report it.
    summaryNeeds = 40;
    const summary = observed.find(
      ({ element }) => (element as HTMLElement).dataset.testid === 'summary',
    );
    summary?.notify();

    expect(fits()).toBe('false');
  });

  it('brings it back when its text shrinks again', () => {
    summaryNeeds = 40;
    render(<Probe />);
    expect(fits()).toBe('false');

    summaryNeeds = 20;
    const summary = observed.find(
      ({ element }) => (element as HTMLElement).dataset.testid === 'summary',
    );
    summary?.notify();

    expect(fits()).toBe('true');
  });
});
