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

function Probe({ inlineRadius }: { inlineRadius?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const radius = useTokenRadius(ref);

  return (
    <div
      ref={ref}
      data-testid="probe"
      className="rounded-full"
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

  it('gives nothing for a radius that is not in pixels', () => {
    stubClassRadius('50%');
    render(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
