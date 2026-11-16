import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';

type ROCallback = ResizeObserverCallback;

let latestObserverInstances: MockResizeObserver[];

class MockResizeObserver {
  callback: ROCallback;
  observeSpy = vi.fn();
  disconnectSpy = vi.fn();

  constructor(cb: ROCallback) {
    this.callback = cb;
    latestObserverInstances.push(this);
  }

  observe(target: Element) {
    this.observeSpy(target);
  }

  disconnect() {
    this.disconnectSpy();
  }

  unobserve() {
    // no-op: required by ResizeObserver interface
  }
}

function triggerAllObservers(width: number, height: number) {
  for (const obs of latestObserverInstances) {
    obs.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      obs,
    );
  }
}

function TestConsumer({ component }: { component: React.ReactElement }) {
  const { nodeWidth, nodeHeight, measurementContainer } = useNodeMeasurement({
    component,
  });
  return (
    <div>
      {measurementContainer}
      <div data-testid="width">{nodeWidth}</div>
      <div data-testid="height">{nodeHeight}</div>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useNodeMeasurement', () => {
  function setup() {
    latestObserverInstances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  }

  test('returns zero dimensions before ResizeObserver fires', () => {
    setup();
    const { getByTestId } = render(
      <TestConsumer component={<div>test</div>} />,
    );
    expect(getByTestId('width').textContent).toBe('0');
    expect(getByTestId('height').textContent).toBe('0');
  });

  test('updates dimensions when size changes', () => {
    setup();
    const { getByTestId } = render(
      <TestConsumer component={<div>test</div>} />,
    );

    act(() => {
      triggerAllObservers(100, 100);
    });
    expect(getByTestId('width').textContent).toBe('100');

    act(() => {
      triggerAllObservers(200, 150);
    });
    expect(getByTestId('width').textContent).toBe('200');
    expect(getByTestId('height').textContent).toBe('150');
  });

  test('cleans up container on unmount', () => {
    setup();
    const { unmount } = render(<TestConsumer component={<div>test</div>} />);

    const before = document.querySelectorAll(
      'div[style*="visibility: hidden"]',
    ).length;

    unmount();

    const after = document.querySelectorAll(
      'div[style*="visibility: hidden"]',
    ).length;

    expect(after).toBeLessThan(before);
  });

  test('renders the component into a hidden wrapper, observes that wrapper, and disconnects on unmount', () => {
    setup();
    const { getByTestId, unmount } = render(
      <TestConsumer component={<div data-testid="measured">test</div>} />,
    );

    const wrapper = getByTestId('measured').parentElement;
    expect(wrapper).toHaveStyle({ visibility: 'hidden' });
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');

    expect(latestObserverInstances).toHaveLength(1);
    const [observer] = latestObserverInstances;
    expect(observer?.observeSpy.mock.calls).toEqual([[wrapper]]);

    unmount();

    expect(observer?.disconnectSpy).toHaveBeenCalledOnce();
  });
});
