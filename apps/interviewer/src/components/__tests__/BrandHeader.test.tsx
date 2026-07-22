import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandHeader } from '../BrandHeader';

describe('BrandHeader', () => {
  it('keeps the app name accessible but visually compact below tablet landscape', () => {
    render(<BrandHeader />);

    expect(screen.getByRole('heading', { name: 'Interviewer' })).toHaveClass(
      'sr-only',
      'tablet-landscape:not-sr-only',
      'tablet-landscape:text-2xl',
      'laptop:text-3xl',
    );
  });

  it('sizes the app mark without forcing a square aspect ratio', () => {
    const { container } = render(<BrandHeader />);
    const mark = container.querySelector('img');

    expect(mark).toHaveClass(
      'h-16',
      'tablet-landscape:h-14',
      'laptop:h-20',
      'w-auto',
    );
    expect(mark).not.toHaveClass('size-20');
  });
});
