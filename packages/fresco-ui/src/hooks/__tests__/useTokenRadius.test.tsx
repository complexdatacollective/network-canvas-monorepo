import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import useTokenRadius from '../useTokenRadius';

// jsdom has no stylesheet, so the radius a `rounded-*` class resolves to is
// supplied by stubbing the computed style. The stub answers from the inline
// style when there is one, the way the cascade would.
const stubClassRadius = (classRadius: string) =>
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element) =>
      ({
        borderTopLeftRadius:
          (element as HTMLElement).style.borderTopLeftRadius || classRadius,
      }) as CSSStyleDeclaration,
  );

function Probe({
  inlineRadius,
  className = 'rounded-full',
}: {
  inlineRadius?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const radius = useTokenRadius(ref);

  return (
    <div
      ref={ref}
      data-testid="probe"
      className={className}
      style={{ borderRadius: inlineRadius ?? radius }}
    >
      {radius === undefined ? 'none' : String(radius)}
    </div>
  );
}

describe('useTokenRadius', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the class radius as a pixel number', () => {
    stubClassRadius('9999px');
    render(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('9999');
    expect(screen.getByTestId('probe').style.borderRadius).toBe('9999px');
  });

  it('reads past an inline radius and puts it back', () => {
    stubClassRadius('14px');
    render(<Probe inlineRadius="50% 20%" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('14');
    expect(screen.getByTestId('probe').style.borderRadius).toBe('50% 20%');
  });

  it('reads again when the class changes on an element that keeps its size', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element) =>
        ({
          borderTopLeftRadius:
            (element as HTMLElement).style.borderTopLeftRadius ||
            (element.classList.contains('rounded-sm') ? '14px' : '9999px'),
        }) as CSSStyleDeclaration,
    );
    const { rerender } = render(<Probe className="rounded-full" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('9999');

    rerender(<Probe className="rounded-sm" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('14');
    expect(screen.getByTestId('probe').style.borderRadius).toBe('14px');
  });

  it('gives nothing for a radius that is not in pixels', () => {
    stubClassRadius('50%');
    render(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
