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
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('unique "key" prop'),
    );
  });
});
