import { DirectionProvider } from '@base-ui/react/direction-provider';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Reveal } from '../Reveal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Reveal', () => {
  it('gives forwarded sibling children stable keys', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { container } = render(
      <Reveal scrollLinked>
        <span>First child</span>
        <span>Second child</span>
      </Reveal>,
    );

    expect(screen.getByText('First child')).toBeInTheDocument();
    expect(screen.getByText('Second child')).toBeInTheDocument();
    expect(container.firstElementChild?.children).toHaveLength(2);
    expect(
      consoleError.mock.calls.some((arguments_) =>
        arguments_.some((argument) =>
          String(argument).includes('unique "key" prop'),
        ),
      ),
    ).toBe(false);
  });

  // Motion writes where an element starts from into its style before the
  // first frame, which is where the reveal is caught here.
  const startOf = (direction: 'ltr' | 'rtl', from: 'left' | 'right') => {
    const { container } = render(
      <DirectionProvider direction={direction}>
        <Reveal direction={from} distance={40}>
          <span>Content</span>
        </Reveal>
      </DirectionProvider>,
    );
    const revealed = container.firstElementChild;
    if (!(revealed instanceof HTMLElement)) throw new Error('nothing rendered');
    return revealed.style.transform;
  };

  it('brings content in from the side named on a left-to-right page', () => {
    expect(startOf('ltr', 'left')).toContain('translateX(-40px)');
    cleanup();
    expect(startOf('ltr', 'right')).toContain('translateX(40px)');
  });

  it('brings it in from the other side on a right-to-left page', () => {
    expect(startOf('rtl', 'left')).toContain('translateX(40px)');
    cleanup();
    expect(startOf('rtl', 'right')).toContain('translateX(-40px)');
  });
});
