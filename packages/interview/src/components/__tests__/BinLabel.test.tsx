import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import BinLabel from '../BinLabel';

// jsdom lays nothing out, so the label's own overflow is driven directly.
// `needed` stands for the height the text wants; `cap` for the height the bin
// currently allows it — which changes when the bin starts reserving room for
// its membership summary, without the surrounding box changing size at all.
let needed = 200;
let cap = 200;

const LONG_LABEL = 'Previously involved, but not currently';

const defineMetric = (metric: string, get: (this: HTMLElement) => number) => {
  Object.defineProperty(HTMLHeadingElement.prototype, metric, {
    configurable: true,
    get,
  });
};

function Probe({ refitOn }: { refitOn: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} data-testid="content">
      <BinLabel
        label={LONG_LABEL}
        variant="circle"
        containerRef={containerRef}
        refitOn={refitOn}
      />
    </div>
  );
}

/** The rung the label was fitted to, read off its type size. */
const fittedSize = () =>
  screen.getByRole('heading').className.match(/\d+(\.\d+)?cqi/)?.[0];

beforeEach(() => {
  needed = 200;
  cap = 200;
  defineMetric('clientWidth', () => 100);
  defineMetric('scrollWidth', () => 100);
  defineMetric('clientHeight', () => cap);
  defineMetric('scrollHeight', () => needed);
});

afterEach(() => {
  for (const metric of [
    'clientWidth',
    'scrollWidth',
    'clientHeight',
    'scrollHeight',
  ]) {
    Reflect.deleteProperty(HTMLHeadingElement.prototype, metric);
  }
});

describe('BinLabel', () => {
  it('re-fits when the bin reserves room the container does not shrink for', async () => {
    const { rerender } = render(<Probe refitOn="whole-bin" />);
    await waitFor(() => expect(fittedSize()).toBe('11cqi'));

    // Someone is dropped into the bin: the label's cap drops to make room for
    // the summary. The box it is fitted inside is a fixed size and does not
    // move, so nothing but the declared change can report this.
    cap = 100;
    rerender(<Probe refitOn="reserved" />);

    await waitFor(() => expect(fittedSize()).not.toBe('11cqi'));
  });

  it('goes back up when the bin empties and hands the room back', async () => {
    cap = 100;
    const { rerender } = render(<Probe refitOn="reserved" />);
    await waitFor(() => expect(fittedSize()).not.toBe('11cqi'));

    cap = 200;
    rerender(<Probe refitOn="whole-bin" />);

    await waitFor(() => expect(fittedSize()).toBe('11cqi'));
  });
});
