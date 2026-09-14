import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installLabelMetrics,
  uninstallLabelMetrics,
} from '../../__tests__/labelMetrics';
import { useFitText } from '../useFitText';

// Capacities under the simulated metrics: 33, 39 and 60 characters. These
// tests exercise the ladder mechanics, not wrapping policy, so every rung
// breaks anywhere to keep the simulated fit a pure character budget.
const STEPS = [
  'text-base line-clamp-3 wrap-anywhere',
  'text-sm line-clamp-3 wrap-anywhere',
  'text-xs line-clamp-4 wrap-anywhere',
] as const;

const SINGLE_STEP = ['text-base line-clamp-3 wrap-anywhere'] as const;

function Probe({
  text,
  enabled,
  steps = STEPS,
  lineHeight,
}: {
  text: string;
  enabled?: boolean;
  steps?: readonly string[];
  /** Resolvable line-height, so the per-line height budget has lines to count. */
  lineHeight?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref, stepIndex, isTruncated } = useFitText<HTMLSpanElement>({
    steps,
    containerRef,
    watch: text,
    enabled,
  });

  return (
    <div ref={containerRef}>
      <span ref={ref} style={lineHeight ? { lineHeight } : undefined}>
        {text}
      </span>
      <output data-testid="state">{`${stepIndex}:${isTruncated}`}</output>
    </div>
  );
}

const state = () => screen.getByTestId('state').textContent;

beforeEach(installLabelMetrics);
afterEach(uninstallLabelMetrics);

describe('useFitText', () => {
  it('keeps the largest rung when the text already fits', async () => {
    render(<Probe text={'a'.repeat(30)} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('steps down one rung when the text overflows the largest', async () => {
    render(<Probe text={'a'.repeat(36)} />);
    await waitFor(() => expect(state()).toBe('1:false'));
  });

  it('steps down to the smallest rung that fits', async () => {
    render(<Probe text={'a'.repeat(55)} />);
    await waitFor(() => expect(state()).toBe('2:false'));
  });

  it('reports truncation when the text overflows even the smallest rung', async () => {
    render(<Probe text={'a'.repeat(200)} />);
    await waitFor(() => expect(state()).toBe('2:true'));
  });

  it('re-fits when the text changes', async () => {
    const { rerender } = render(<Probe text={'a'.repeat(30)} />);
    await waitFor(() => expect(state()).toBe('0:false'));

    rerender(<Probe text={'a'.repeat(55)} />);
    await waitFor(() => expect(state()).toBe('2:false'));

    rerender(<Probe text={'a'.repeat(20)} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('re-fits when fluid type changes without resizing the container', async () => {
    uninstallLabelMetrics();
    let fluidTypeHasGrown = false;
    const defineMetric = (
      metric: string,
      get: (this: HTMLElement) => number,
    ) => {
      Object.defineProperty(HTMLSpanElement.prototype, metric, {
        configurable: true,
        get,
      });
    };
    defineMetric('clientWidth', () => 100);
    defineMetric('scrollWidth', function (this: HTMLElement) {
      return fluidTypeHasGrown && this.className.includes('text-base')
        ? 101
        : 100;
    });
    defineMetric('clientHeight', () => 20);
    defineMetric('scrollHeight', () => 20);

    render(<Probe text="Fluid label" />);
    await waitFor(() => expect(state()).toBe('0:false'));

    // The node box stays fixed while a viewport-based text token grows.
    // ResizeObserver therefore has nothing to report from the container.
    fluidTypeHasGrown = true;
    fireEvent.resize(window);

    await waitFor(() => expect(state()).toBe('1:false'));
  });

  it('still reports truncation for a single-rung ladder', async () => {
    render(<Probe text={'a'.repeat(200)} steps={SINGLE_STEP} />);
    await waitFor(() => expect(state()).toBe('0:true'));
  });

  it('scales its height slack to the line box, not to a fixed number of pixels', async () => {
    // A box sized by a grid track rather than by whole lines can hide a third of
    // its last line inside a fixed six-pixel budget, while a single 42px line
    // that fits exactly still measures two pixels over from integer scroll
    // metrics. So the slack is the leading under the last line, floored at the
    // rounding error: three pixels of a 15px line is clipping, and must step
    // down.
    uninstallLabelMetrics();
    const defineMetric = (
      metric: string,
      get: (this: HTMLElement) => number,
    ) => {
      Object.defineProperty(HTMLSpanElement.prototype, metric, {
        configurable: true,
        get,
      });
    };
    defineMetric('clientWidth', () => 100);
    defineMetric('scrollWidth', () => 100);
    defineMetric('clientHeight', () => 30);
    defineMetric('scrollHeight', function (this: HTMLElement) {
      // 34 is four pixels over a 15px line box (slack 2.25) — real clipping.
      return this.className.includes('text-base') ? 34 : 30;
    });

    render(<Probe text="x" lineHeight="15px" />);

    await waitFor(() => expect(state()).toBe('1:false'));
  });

  it('keeps a rung whose only excess is integer rounding', async () => {
    // A line that fits exactly still measures a pixel or two over, because
    // scrollHeight and clientHeight are each one rounding of a fractional
    // height. Stepping down there is what makes a one-line label render smaller
    // than the long label beside it — so the slack never falls below that,
    // however tight the leading.
    //
    // The ladder starts at the floor and has to climb back, so reaching the
    // largest rung is a result the fitter produced rather than the state it
    // started in.
    uninstallLabelMetrics();
    let excess = 40;
    const defineMetric = (
      metric: string,
      get: (this: HTMLElement) => number,
    ) => {
      Object.defineProperty(HTMLSpanElement.prototype, metric, {
        configurable: true,
        get,
      });
    };
    defineMetric('clientWidth', () => 100);
    defineMetric('scrollWidth', () => 100);
    defineMetric('clientHeight', () => 12);
    defineMetric('scrollHeight', () => 12 + excess);

    render(<Probe text="x" lineHeight="12px" />);
    await waitFor(() => expect(state()).toBe('2:true'));

    excess = 2;
    fireEvent.resize(window);

    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('lets a tall line spend its own leading before stepping down', async () => {
    // The slack is the leading under the last line, so a 40px line box absorbs
    // several pixels that would be real clipping on a 12px one. A flat
    // pixel budget would send this rung down for nothing.
    uninstallLabelMetrics();
    let excess = 200;
    const defineMetric = (
      metric: string,
      get: (this: HTMLElement) => number,
    ) => {
      Object.defineProperty(HTMLSpanElement.prototype, metric, {
        configurable: true,
        get,
      });
    };
    defineMetric('clientWidth', () => 100);
    defineMetric('scrollWidth', () => 100);
    defineMetric('clientHeight', () => 40);
    defineMetric('scrollHeight', () => 40 + excess);

    render(<Probe text="x" lineHeight="40px" />);
    await waitFor(() => expect(state()).toBe('2:true'));

    excess = 5;
    fireEvent.resize(window);

    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('steps down for any width excess, and falls back to a fixed height budget without a line height', async () => {
    // A pixel of hidden width is a clipped letter stroke; a few pixels of
    // scroll height are fractional line boxes rounding up — four visible
    // lines on a 13.8px leading can measure that far "over" with nothing
    // hidden. A genuinely clipped line adds a full line box, far more.
    uninstallLabelMetrics();
    const defineMetric = (
      metric: string,
      get: (this: HTMLElement) => number,
    ) => {
      Object.defineProperty(HTMLSpanElement.prototype, metric, {
        configurable: true,
        get,
      });
    };
    defineMetric('clientWidth', () => 100);
    defineMetric('scrollWidth', function (this: HTMLElement) {
      return this.className.includes('text-base') ? 101 : 100;
    });
    defineMetric('clientHeight', () => 20);
    defineMetric('scrollHeight', function (this: HTMLElement) {
      // Rounding-sized excess everywhere except the smallest rung, which
      // shows a whole hidden line.
      return this.className.includes('text-xs') ? 34 : 26;
    });

    render(<Probe text="x" />);

    // Rung 1, not 0: the one-pixel width excess at the largest rung is real
    // overflow. Rung 1, not 2: the six-pixel height excess is rounding noise,
    // so the ladder must not walk past it to the rung with a hidden line.
    await waitFor(() => expect(state()).toBe('1:false'));
  });

  it('does nothing when disabled', async () => {
    render(<Probe text={'a'.repeat(200)} enabled={false} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('resets when fitting is turned off', async () => {
    const { rerender } = render(<Probe text={'a'.repeat(200)} enabled />);
    await waitFor(() => expect(state()).toBe('2:true'));

    rerender(<Probe text={'a'.repeat(200)} enabled={false} />);
    await waitFor(() => expect(state()).toBe('0:false'));
  });

  it('measures every element together, not one at a time', async () => {
    // Writing a class name and then reading a measurement back forces the
    // browser to lay out again. Doing that per element would cost a layout per
    // element per rung; batching costs one per rung however many there are.
    // This asserts the property that makes it cheap: all of a rung's writes
    // land before any of its reads.
    const order: ('write' | 'read')[] = [];
    const classNameDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'className',
    )!;
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLSpanElement.prototype,
      'scrollHeight',
    )!;

    Object.defineProperty(Element.prototype, 'className', {
      configurable: true,
      get: classNameDescriptor.get,
      set(this: Element, value: string) {
        order.push('write');
        classNameDescriptor.set!.call(this, value);
      },
    });
    Object.defineProperty(HTMLSpanElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        order.push('read');
        return scrollHeightDescriptor.get!.call(this) as number;
      },
    });

    const layoutPassesFor = async (count: number) => {
      order.length = 0;
      const view = render(
        <>
          {Array.from({ length: count }, (_, index) => (
            <Probe key={index} text={'a'.repeat(200)} />
          ))}
        </>,
      );
      await waitFor(() =>
        expect(screen.getAllByTestId('state')).toHaveLength(count),
      );
      view.unmount();
      return order.filter(
        (entry, index) => entry === 'read' && order[index - 1] === 'write',
      ).length;
    };

    try {
      const few = await layoutPassesFor(4);
      const many = await layoutPassesFor(40);

      // Ten times the elements must not cost ten times the layout passes.
      expect(many).toBe(few);
      expect(many).toBeLessThanOrEqual(STEPS.length * 2);
    } finally {
      Object.defineProperty(
        Element.prototype,
        'className',
        classNameDescriptor,
      );
      Object.defineProperty(
        HTMLSpanElement.prototype,
        'scrollHeight',
        scrollHeightDescriptor,
      );
    }
  });

  it('applies the fitted rung to the element', async () => {
    render(<Probe text={'a'.repeat(55)} />);
    await waitFor(() => expect(state()).toBe('2:false'));
    expect(screen.getByText('a'.repeat(55))).toHaveClass(
      'text-xs',
      'line-clamp-4',
    );
  });
});
