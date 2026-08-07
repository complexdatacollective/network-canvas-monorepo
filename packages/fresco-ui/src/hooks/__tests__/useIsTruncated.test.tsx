import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useIsTruncated } from '../useIsTruncated';

function Probe({
  watch,
  enabled,
  scrollHeight,
  clientHeight,
}: {
  watch?: string;
  enabled?: boolean;
  scrollHeight: number;
  clientHeight: number;
}) {
  const { ref, isTruncated } = useIsTruncated<HTMLSpanElement>({
    watch,
    enabled,
  });
  return (
    <span
      data-testid="probe"
      data-truncated={isTruncated}
      ref={(el) => {
        if (el) {
          Object.defineProperty(el, 'scrollHeight', {
            configurable: true,
            get: () => scrollHeight,
          });
          Object.defineProperty(el, 'clientHeight', {
            configurable: true,
            get: () => clientHeight,
          });
        }
        ref.current = el;
      }}
    >
      {watch}
    </span>
  );
}

const isTruncated = () =>
  screen.getByTestId('probe').getAttribute('data-truncated') === 'true';

describe('useIsTruncated', () => {
  it('measures on mount and reports overflow beyond the 1px tolerance', () => {
    render(<Probe watch="long label" scrollHeight={60} clientHeight={40} />);
    expect(isTruncated()).toBe(true);
  });

  it('reports false when content fits', () => {
    render(<Probe watch="short" scrollHeight={40} clientHeight={40} />);
    expect(isTruncated()).toBe(false);
  });

  it('treats sub-pixel overflow as not truncated', () => {
    render(<Probe watch="edge" scrollHeight={41} clientHeight={40} />);
    expect(isTruncated()).toBe(false);
  });

  it('re-measures when watch changes', () => {
    const { rerender } = render(
      <Probe watch="short" scrollHeight={40} clientHeight={40} />,
    );
    expect(isTruncated()).toBe(false);

    rerender(
      <Probe watch="a much longer label" scrollHeight={60} clientHeight={40} />,
    );
    expect(isTruncated()).toBe(true);
  });

  it('re-measures when the ResizeObserver fires', async () => {
    let scrollHeight = 40;
    function ResizingProbe() {
      const { ref, isTruncated: truncated } = useIsTruncated<HTMLSpanElement>();
      return (
        <span
          data-testid="probe"
          data-truncated={truncated}
          ref={(el) => {
            if (el) {
              Object.defineProperty(el, 'scrollHeight', {
                configurable: true,
                get: () => scrollHeight,
              });
              Object.defineProperty(el, 'clientHeight', {
                configurable: true,
                get: () => 40,
              });
            }
            ref.current = el;
          }}
        />
      );
    }

    render(<ResizingProbe />);
    expect(isTruncated()).toBe(false);

    scrollHeight = 60;
    await act(async () => {});
    expect(isTruncated()).toBe(true);
  });

  it('returns false when disabled, even if the element overflows', () => {
    render(
      <Probe
        watch="long"
        enabled={false}
        scrollHeight={60}
        clientHeight={40}
      />,
    );
    expect(isTruncated()).toBe(false);
  });

  it('resets when enabled flips to false', () => {
    const { rerender } = render(
      <Probe watch="long" enabled scrollHeight={60} clientHeight={40} />,
    );
    expect(isTruncated()).toBe(true);

    rerender(
      <Probe
        watch="long"
        enabled={false}
        scrollHeight={60}
        clientHeight={40}
      />,
    );
    expect(isTruncated()).toBe(false);
  });

  it('does not set state after unmount from the fonts-ready path', async () => {
    let resolveFonts: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready },
    });

    try {
      const { unmount } = render(
        <Probe watch="long" scrollHeight={60} clientHeight={40} />,
      );
      unmount();
      await act(async () => {
        resolveFonts();
        await ready;
      });
    } finally {
      Reflect.deleteProperty(document, 'fonts');
    }
  });
});
